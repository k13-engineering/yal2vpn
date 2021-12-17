import tuntap2 from "./third_party/node-tuntap2/lib/index.js";
import EventEmitter from "events";
import rtnetlink from "./third_party/node-rtnetlink/index.js";

const create = ({ bridge, mtu = 1200 }) => {
  const emitter = new EventEmitter();

  let closed = false;

  const rt$ = rtnetlink.open();
  rt$.catch((err) => {
    console.error(err);
  });

  let devOrNothing = undefined;

  tuntap2
    .create({ type: "tap" })
    .then((dev) => {
      devOrNothing = dev;

      if (closed) {
        dev.close().catch((err) => {
          console.error(err);
        });
      }

      return rt$.then((rt) => {
        const devLink = rt.link.fromIndex({ ifindex: dev.ifindex });

        return devLink
          .modify({
            mtu,
          })
          .then(() => {
            console.log("mtu set");
            dev.on("packet", (pkt) => {
              // if (pkt.length <= mtu) {
              emitter.emit("packet", pkt);
              // } else {
              //   console.warn(`packet size ${pkt.length} too large!`);
              // }
            });

            return bridge.connect({ ifindex: dev.ifindex });
          });
      });
    })
    .then(() => {
      emitter.emit("ready");
    })
    .catch((err) => {
      emitter.emit("error", err);
    });

  const send = ({ packet }) => {
    if (devOrNothing) {
      // console.log("sending", packet.length);
      devOrNothing.send(packet).catch((err) => {
        if (err.code !== "EINVAL") {
          // TODO: check ethernet checksum, so we can skip this check
          console.warn("most likely invalid packet");
          emitter.emit("error", err);
        }
      });
    }
  };

  const close = () => {
    closed = true;

    if (devOrNothing) {
      devOrNothing.close().catch((err) => {
        console.error(err);
      });
    }

    // TODO: what happens if MTU / bridge setup is in progress?

    rt$.then((rt) => {
      rt.close().catch((err) => {
        console.error(err);
      });
    });
  };

  return {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),

    send,

    close,
  };
};

export default {
  create,
};
