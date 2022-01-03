import tuntap2 from "../node-tuntap2/lib/index.js";
import EventEmitter from "events";
import rtnetlink from "node-rtnetlink";

const create = ({ logger, bridge, mtu = 1200 }) => {
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

      logger.log(`interface ${dev.name} created`);

      return rt$.then((rt) => {
        const devLink = rt.link.fromIndex({ ifindex: dev.ifindex });

        return devLink
          .modify({
            mtu,
          })
          .then(() => {
            logger.log(`interface MTU set to ${mtu}`);

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
      logger.log("interface connected to bridge and ready");
      emitter.emit("ready");
    })
    .catch((err) => {
      logger.error(err);
      emitter.emit("error", err);
    });

  const send = ({ packet }) => {
    if (devOrNothing) {
      // console.log("sending", packet.length);
      devOrNothing.send(packet).catch((err) => {
        if (err.code !== "EINVAL") {
          // TODO: check ethernet checksum, so we can skip this check
          logger.warn(`most likely invalid packet with size ${packet.length}`);
          emitter.emit("error", err);
        }
      });
    }
  };

  const close = () => {
    closed = true;

    if (devOrNothing) {
      devOrNothing.close().then(() => {
        logger.log("TAP device removed");
      }).catch((err) => {
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
