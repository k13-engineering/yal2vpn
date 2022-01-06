import tuntap2 from "node-tuntap2";
import EventEmitter from "events";
import rtnetlink from "node-rtnetlink";

const create = ({ logger, bridge, mtu = 1200 }) => {
  const emitter = new EventEmitter();

  let closed = false;
  let ready = false;

  const rt$ = rtnetlink.open();
  rt$.catch((err) => {
    console.error(err);
  });

  const device = tuntap2.create({ type: "tap" });
  device.on("open", ({ ifindex, name }) => {
    logger.log(`interface ${name} created`);

    rt$
      .then((rt) => {
        // const devLink = rt.link.fromIndex({ ifindex });

        // return devLink
        //   .modify({
        //     mtu,
        //   })
        //   .then(() => {
        //     logger.log(`interface MTU set to ${mtu}`);

        return bridge.connect({ ifindex });
        //   });
      })
      .then(() => {
        logger.log("interface connected to bridge and ready");

        ready = true;
        emitter.emit("ready");
      })
      .catch((err) => {
        logger.error(err);
        emitter.emit("error", err);
      });
  });
  device.on("packet", (pkt) => {
    if (!ready) {
      return;
    }

    // if (pkt.length <= mtu) {
    emitter.emit("packet", pkt);
    // } else {
    //   console.warn(`packet size ${pkt.length} too large!`);
    // }
  });

  const send = ({ packet }) => {
    if (!ready) {
      return;
    }

    device.send(packet);
  };

  const close = () => {
    closed = true;
    device.close();

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
