#!/bin/bash

import yargs from "yargs";
import yal2vpn from "./index.js";
import WebSocket from "ws";

process.nextTick(async () => {
  try {
    const cli = yargs(process.argv.slice(2))
      .option("c")
      .alias("c", "client")
      .describe("c", "client mode")
      .option("s")
      .alias("s", "server")
      .describe("s", "server mode")
      .strict();

    const args = cli.argv;

    if (args.client) {
      const connection = new WebSocket("http://192.168.1.193:8080");
      connection.on("open", () => {
        yal2vpn.client({ connection });
      });
      connection.on("error", (ex) => {
        console.error(ex);
      });
    } else if (args.server) {
      const port = 8080;
      const socket = new WebSocket.Server({ port });
      const server = yal2vpn.server({ socket });
      console.log(`Listening on :${port}`);
      process.on("SIGINT", async () => {
        try {
          await server.close();
          process.exit(0);
        } catch (ex) {
          console.error(ex);
          process.exitCode = -1;
        }
      });
    } else {
      cli.showHelp();
    }
  } catch (ex) {
    console.error(ex);
    process.exitCode = -1;
  }
});
