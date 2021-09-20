import tap from "./tap.js";
import rtnetlink from "../../node-rtnetlink/index.js";

export default ({ socket }) => {
  let bridgeLink;

  rtnetlink.open().then(async (rt) => {
    bridgeLink = await rt.link.createLink({
      "linkinfo": {
        "kind": "bridge"
      },
      "flags": {
        "IFF_UP": true
      }
    });

    socket.on("connection", (connection) => {
      console.log("client connected!");

      tap.create().then(async (dev) => {
        const devLink = rt.link.fromIndex({ "ifindex": dev.ifindex });
        await devLink.modify({
          "masterIndex": bridgeLink.ifindex
        });
        dev.handover({ connection });
      });
    });
  });

  const close = async () => {
    if (bridgeLink) {
      await bridgeLink.deleteLink();
    }
  };

  return {
    close
  };
};
