import dgram, { Socket } from "dgram";
import { performance } from "perf_hooks";

let totalReceived = 0;

const sock = dgram.createSocket("udp4");
sock.bind(4444);
sock.on("message", () => {
  totalReceived += 1;
});

const buf = Buffer.alloc(1400);

const sock2 = dgram.createSocket("udp4");

let totalSent = 0;
const startAt = performance.now();

setInterval(() => {
  for (let i = 0; i < 60; i += 1) {
    sock2.send(buf, 0, buf.length, 4444, "127.0.0.1");
    totalSent += 1;
  }
}, 0);

setInterval(() => {
  const now = performance.now();

  const diffSec = (now - startAt) / 1000.0;
  const packetsPerSec = totalSent / diffSec;
  const packetsReceivedPerSec = totalReceived / diffSec;

  console.log(`sent ${totalSent} in ${diffSec} sec, ${packetsPerSec} p/s`);
  console.log(`received ${totalReceived} in ${diffSec} sec, ${packetsReceivedPerSec} p/s`);
}, 3000);