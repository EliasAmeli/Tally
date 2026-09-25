import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwAuth from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as apigwInt from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as path from "path";

export class TallyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------- Data ----------
    const table = new dynamodb.Table(this, "TallyTable", {
      tableName: "TallyTable",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ---------- Auth ----------
    const userPool = new cognito.UserPool(this, "TallyUserPool", {
      userPoolName: "tally-users",
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient("TallyWebClient", {
      authFlows: { userSrp: true },
      generateSecret: false,
    });

    // ---------- Lambda handlers ----------
    const backendRoot = path.join(__dirname, "..", "..", "backend");
    const handlersDir = path.join(backendRoot, "src", "handlers");

    const makeFn = (id: string, entry: string, handler: string) =>
      new lambdaNode.NodejsFunction(this, id, {
        entry: path.join(handlersDir, entry),
        handler,
        runtime: lambda.Runtime.NODEJS_20_X,
        projectRoot: backendRoot,
        depsLockFilePath: path.join(backendRoot, "package-lock.json"),
        environment: {
          TABLE_NAME: table.tableName,
        },
        bundling: { minify: true },
      });

    const jobsList = makeFn("JobsListFn", "jobs.ts", "list");
    const jobsCreate = makeFn("JobsCreateFn", "jobs.ts", "create");
    const shiftsList = makeFn("ShiftsListFn", "shifts.ts", "list");
    const shiftsCreate = makeFn("ShiftsCreateFn", "shifts.ts", "create");
    const shiftsUpdate = makeFn("ShiftsUpdateFn", "shifts.ts", "update");
    const shiftsRemove = makeFn("ShiftsRemoveFn", "shifts.ts", "remove");
    const parseShift = makeFn("ParseShiftFn", "parseShift.ts", "parse");
    const payrollCurrent = makeFn("PayrollCurrentFn", "payroll.ts", "current");

    for (const fn of [
      jobsList, jobsCreate, shiftsList, shiftsCreate,
      shiftsUpdate, shiftsRemove, parseShift, payrollCurrent,
    ]) {
      table.grantReadWriteData(fn);
    }

    // ---------- API ----------
    const authorizer = new apigwAuth.HttpUserPoolAuthorizer(
      "TallyAuthorizer",
      userPool,
      { userPoolClients: [userPoolClient] },
    );

    const httpApi = new apigwv2.HttpApi(this, "TallyHttpApi", {
      apiName: "tally-api",
      corsPreflight: {
        allowOrigins: ["*"], // tighten to the CloudFront domain once known
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ["Authorization", "Content-Type"],
      },
    });

    const route = (
      path_: string,
      method: apigwv2.HttpMethod,
      fn: lambdaNode.NodejsFunction,
    ) =>
      httpApi.addRoutes({
        path: path_,
        methods: [method],
        integration: new apigwInt.HttpLambdaIntegration(`${fn.node.id}Int`, fn),
        authorizer,
      });

    route("/jobs", apigwv2.HttpMethod.GET, jobsList);
    route("/jobs", apigwv2.HttpMethod.POST, jobsCreate);
    route("/shifts", apigwv2.HttpMethod.GET, shiftsList);
    route("/shifts", apigwv2.HttpMethod.POST, shiftsCreate);
    route("/shifts/{id}", apigwv2.HttpMethod.PUT, shiftsUpdate);
    route("/shifts/{id}", apigwv2.HttpMethod.DELETE, shiftsRemove);
    route("/parse", apigwv2.HttpMethod.POST, parseShift);
    route("/payroll/current", apigwv2.HttpMethod.GET, payrollCurrent);

    // ---------- Frontend hosting ----------
    const siteBucket = new s3.Bucket(this, "TallySiteBucket", {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const distribution = new cloudfront.Distribution(this, "TallyDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      errorResponses: [
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
    });

    // ---------- Outputs ----------
    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "DistributionDomain", { value: distribution.distributionDomainName });
  }
}
