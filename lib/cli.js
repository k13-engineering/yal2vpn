#!/bin/env node

import fs from "fs";
import { v4 } from "uuid";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "path";
import loggerFactory from "./logger.js";
import yal2vpn from "./index.js";

const { argv } = yargs(hideBin(process.argv))
  .usage("Usage: yal2vpn -c [config.json]")
  .demandOption(["config"])
  .describe("c", "config file to use")
  .alias("c", "config")
  .strict();

const logger = loggerFactory.create({});

const configFilePath = path.resolve(argv.config);
logger.log(`using config file "${configFilePath}"`);
const configFileDirectory = path.dirname(configFilePath);

const configAsString = fs.readFileSync(argv.config, "utf8");
const config = JSON.parse(configAsString);

if (!config.privateKeyFile) {
  throw Error("config needs privateKeyFile");
}

if (typeof config.publicKeyFiles !== "object") {
  throw Error("config needs publicKeyFiles object");
}

if (!config.interfaceName) {
  throw Error("config needs interfaceName");
}

if (!config.townhall || typeof config.townhall !== "object") {
  throw Error("config needs townhall as object");
}

if (!config.townhall.url) {
  throw Error("config needs townhall.url");
}

const privateKeyFile = path.resolve(configFileDirectory, config.privateKeyFile);
logger.log(`using private key file "${privateKeyFile}"`);
const privateKey = fs.readFileSync(privateKeyFile, "utf8");

let publicKeys = {};
Object.keys(config.publicKeyFiles).forEach((name) => {
  const publicKeyFile = path.resolve(
    configFileDirectory,
    config.publicKeyFiles[name]
  );
  logger.log(`using public key file "${publicKeyFile}" to identify "${name}"`);

  publicKeys = {
    ...publicKeys,
    [name]: fs.readFileSync(publicKeyFile, "utf8"),
  };
});

const clientId = v4();

const vpn = yal2vpn.create({
  clientId,
  interfaceName: config.interfaceName,
  townhallUrl: config.townhall.url,
  privateKey,
  publicKeys,
});

vpn.onError(({ error }) => {
  // logger.error(error);
  vpn.close();
});

let signalsCount = 0;
const SIGNALS_COUNT_TO_EXIT_AT = 4;

const requestExitBySignal = ({ signal }) => {
  // insert new line so ^C is displayed in a own line
  console.log();
  logger.log(`caught ${signal}`);
  
  signalsCount += 1;

  if (signalsCount === 1) {
    logger.log("stopping...");
    vpn.close();
  } else if (signalsCount < SIGNALS_COUNT_TO_EXIT_AT) {
    const signalsLeftBeforeKill = SIGNALS_COUNT_TO_EXIT_AT - signalsCount;

    logger.warn(`${signalsLeftBeforeKill} signals left before aggresive exit`);
  } else {
    logger.warn(`agressively exiting...`);
    process.exit(-1);
  }
};

process.on("SIGTERM", () => {
  requestExitBySignal({ signal: "SIGTERM" });
});

process.on("SIGINT", () => {
  requestExitBySignal({ signal: "SIGINT" });
});
