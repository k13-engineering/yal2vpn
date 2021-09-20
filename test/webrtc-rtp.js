/* eslint-disable */
/* global describe */
/* global it */

import datachannel from "node-datachannel";
import rtpPacket from "../lib/rtp-packet.js";

// callback are called from C++ code
// raising an exception in the callbacks
// causes a process abort, so we make sure
// we never throw inside of a callback
const noExceptions = (fn) => {
  return (...args) => {
    try {
      fn(...args);
    } catch (ex) {
      console.error(ex);

      try {
        emitter.emit("error", ex);
      } catch (ex2) {
        console.error(ex2);
      }
    }
  };
};

const createFence = () => {
  let waitingFor = [];
  let listeners = [];

  const add = () => {
    const func = () => {
      waitingFor = waitingFor.filter((entry) => {
        return entry !== func;
      });

      if (waitingFor.length === 0) {
        listeners.forEach((l) => {
          l.resolve();
        });
        listeners = [];
      }
    };

    waitingFor = [...waitingFor, func];

    return func;
  };

  const promise = () => {
    return new Promise((resolve, reject) => {
      if (waitingFor.length === 0) {
        resolve();
        return;
      }

      listeners = [...listeners, { resolve, reject }];
    });
  };

  return {
    add,
    promise,
  };
};

describe("webrtc connection", function () {
  this.timeout(120000);

  it("should work", () => {
    const pc1 = new datachannel.PeerConnection("pc", {
      iceServers: [],
    });
    const pc2 = new datachannel.PeerConnection("pc", {
      iceServers: [],
    });

    const fence = createFence();
    const pc1Connected = fence.add();
    const pc2Connected = fence.add();

    const video1 = new datachannel.Video("video", "SendRecv");
    video1.addH264Codec(96);
    video1.setBitrate(3000);
    video1.addSSRC(4);
    const track1 = pc1.addTrack(video1);
    track1.onMessage(() => {});

    const video2 = new datachannel.Video("video", "SendRecv");
    video2.addH264Codec(96);
    video2.setBitrate(3000);
    video2.addSSRC(4);
    const track2 = pc2.addTrack(video2);

    // const session1 = new datachannel.RtcpReceivingSession();
    // track1.setMediaHandler(session1);

    // const session2 = new datachannel.RtcpReceivingSession();
    // track2.setMediaHandler(session2);

    pc1.onGatheringStateChange(
      noExceptions((state) => {
        if (state === "complete") {
          let desc = pc1.localDescription();

          pc2.setRemoteDescription(desc.sdp, desc.type);
          // pc2.setLocalDescription("answer");
        }
      })
    );
    pc1.setLocalDescription();

    pc2.onGatheringStateChange(
      noExceptions((state) => {
        if (state === "complete") {
          let desc = pc2.localDescription();

          pc1.setRemoteDescription(desc.sdp, desc.type);
        }
      })
    );

    pc1.onStateChange(
      noExceptions((state) => {
        if (state === "connected") {
          pc1Connected();
        }
      })
    );

    pc2.onStateChange(
      noExceptions((state) => {
        if (state === "connected") {
          pc2Connected();
        }
      })
    );

    return fence
      .promise()
      .then(() => {
        const fence2 = createFence();
        const messageFromPc1Received = fence2.add();
        const messageFromPc2Received = fence2.add();

        track1.onMessage((msg) => {
          messageFromPc2Received();
        });

        track2.onMessage((msg) => {
          messageFromPc1Received();
        });

        const send = ({ track, payload }) => {
          const packet = rtpPacket.format({
            packet: {
              version: 2,
              padding: 0,
              extensions: 0,
              marker: 0,
              payloadType: 96,
              sequenceNumber: 1,
              timestamp: 1,
              ssrc: 4,
              csrc: [],
              extension: null,
              payload,
            },
          });

          track.sendMessageBinary(packet);
        };

        send({ track: track1, payload: Buffer.alloc(32) });
        send({ track: track2, payload: Buffer.alloc(32) });

        return fence2.promise();
      })
      .finally(() => {
        track1.close();
        track2.close();

        pc1.close();
        pc2.close();
      });
  });
});
