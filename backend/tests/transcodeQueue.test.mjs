import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { streamFfmpeg } from '../services/mediaTools.js';

test('FFmpeg allows one active conversion, queues the next and cancels a disconnected request', () => {
  const children = [];
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => child.emit('close', 1);
    children.push(child);
    return child;
  };
  const response = () => Object.assign(new PassThrough(), { status() { return this; }, json() { return this; } });
  const firstReq = new EventEmitter(); const firstRes = response();
  const secondReq = new EventEmitter(); const secondRes = response();
  streamFfmpeg('first.mp4', firstReq, firstRes, { spawnImpl });
  streamFfmpeg('second.mp4', secondReq, secondRes, { spawnImpl });
  assert.equal(children.length, 1);
  children[0].emit('close', 1);
  assert.equal(children.length, 2);
  secondRes.emit('close');
  assert.equal(children.length, 2);
});
