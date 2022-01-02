import tuntap2 from "./third_party/node-tuntap2/lib/index.js";
import { performance } from "perf_hooks";
import posixSocket from "./third_party/node-posix-socket-libjs/lib/index.js";

let packetsReceived = 0;
let startTime = performance.now();

tuntap2.create({ type: "tap" }).then((dev) => {
  dev.on("packet", (pkt) => {
    packetsReceived += 1;
  });
});



setInterval(() => {
    const diffSec = (performance.now() - startTime) / 1000.0;
    const packetsPerSec = packetsReceived / diffSec;

    console.log(`recevied ${packetsPerSec.toFixed(2)} pkts / sec`);

    packetsReceived = 0;
    startTime = performance.now();
}, 5000);