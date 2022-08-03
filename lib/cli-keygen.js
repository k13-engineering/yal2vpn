#!/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import keygen from "./keygen.js";
import fs from "fs";

const { argv } = yargs(hideBin(process.argv))
  .usage("Usage: yal2vpn-keygen -o [filename]")
  .option("output", {
    alias: "o",
    type: "string",
    description: "output filename",
  })
  .demandOption("output")
  .strict();

const { privateKey, publicKey } = keygen.generateKeyPair();

fs.createWriteStream(`${argv.output}`, {
  mode: 0o600,
}).end(privateKey);

fs.createWriteStream(`${argv.output}.pub`).end(publicKey);
