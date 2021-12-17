import tap from "./tap.js";
import rtnetlink from "../../node-rtnetlink/index.js";

export default ({ socket }) => {
  const rt$ = rtnetlink.open();

  const bridgeLink$ = rt$.then((rt) => {
    return rt.link.createLink({
      "linkinfo": {
        "kind": "bridge"
      },
      "flags": {
        "IFF_UP": true
      }
    });
  });
  
  bridgeLink$.catch((err) => {
    console.error(err);
  });

  socket.on("connection", (connection) => {
    console.log("client connected!");

    tap.create().then((dev) => {
      return rt$.then((rt) => {
        const devLink = rt.link.fromIndex({ "ifindex": dev.ifindex });

        return bridgeLink$.then((bridgeLink) => {
          return devLink.modify({
            "masterIndex": bridgeLink.ifindex
          });
        });
      }).then(() => {
        dev.handover({ connection });
      }).catch((err) => {
        console.error(err);
        connection.close(1, "internal server error");
      });
    }).catch((err) => {
      console.error(err);
      connection.close(1, "internal server error");
    });
  });

  const close = () => {
    return bridgeLink$.then((bridgeLink) => {
      return bridgeLink.deleteLink();
    });
  };

  return {
    close
  };
};
