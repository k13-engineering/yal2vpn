#!/bin/bash

import yargs from "yargs";
import yal2vpn from "./index.js";
import WebSocket from "ws";

process.nextTick(async () => {
  try {
    const args = yargs(process.argv.slice(2))
      .option("c")
      .alias("c", "client")
      .describe("c", "client mode")
      .option("s")
      .alias("s", "server")
      .describe("s", "server mode")
      .strict()
      .argv;

    if (args.client) {
      const connection = new WebSocket("http://172.17.0.1:8080");
      connection.on("open", () => {
        yal2vpn.client({ connection });
      });
      connection.on("error", (ex) => {
        console.error(ex);
      });
    } else if (args.server) {
      const socket = new WebSocket.Server({ "port": 8080 });
      const server = yal2vpn.server({ socket });
      process.on("SIGINT", async () => {
        try {
          await server.close();
          process.exit(0);
        } catch (ex) {
          console.error(ex);
          process.exitCode = -1;
        }
      });
    }
  } catch (ex) {
    console.error(ex);
    process.exitCode = -1;
  }
});
