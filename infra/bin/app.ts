#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { TallyStack } from "../lib/tally-stack";

const app = new cdk.App();

new TallyStack(app, "TallyStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ca-central-1",
  },
});
