import tuntap2 from "./third_party/node-tuntap2/lib/index.js";
import EventEmitter from "events";
import rtnetlink from "./third_party/node-rtnetlink/index.js";

const rt$ = rtnetlink.open();
rt$.catch((err) => {
  console.error(err);
});

const create = ({ bridge, mtu = 1200 }) => {
  const emitter = new EventEmitter();

  let devOrNothing = undefined;

  tuntap2
    .create({ type: "tap" })
    .then((dev) => {
      devOrNothing = dev;

      return rt$.then((rt) => {
        const devLink = rt.link.fromIndex({ ifindex: dev.ifindex });

        return devLink.modify({
          // mtu
        }).then(() => {
          dev.on("packet", (pkt) => {
            if (pkt.length <= mtu) {
              emitter.emit("packet", pkt);
            }
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
      devOrNothing.send(packet).catch((err) => {
        if (err.code !== "EINVAL") {
          // TODO: check ethernet checksum, so we can skip this check
          console.warn("most likely invalid packet");
          emitter.emit("error", err);
        }
      });
    }
  };

  return {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),

    send,
  };
};

export default {
  create,
};
