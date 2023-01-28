import fetch from "node-fetch";
import { createWriteStream, createReadStream } from "node:fs";
import { once } from "node:events";
import * as readline from "node:readline";

const ALEPHIUM_API_URL = "https://backend-v18.mainnet.alephium.org";
const TIMESTAMP_24H_MS = 86_400_000;
const TIMESTAMP_168H_MS = 7 * TIMESTAMP_24H_MS; //last 7 days
const HASHRATE_1TH = 1_000_000_000_000; //converted to h/s
const HASHRATE_1EH = 1_000_000_000_000_000_000;
const HASHRATE_1GH = 1_000_000_000;
const HASHRATE_1MH = 1_000_000;
const HASHRATE_1KH = 1_000;
const TIMESTAMP_BEGIN = 1636383299070; //first timestamp that recorded hashrate
const HOURLY_LIMIT_MS = 2592000000; //30 days worth of data per hour

const getHashrateString = (hashrate) => {
  if (hashrate > HASHRATE_1EH)
    return (hashrate / HASHRATE_1EH).toFixed(2) + " EH/s";
  if (hashrate > HASHRATE_1TH)
    return (hashrate / HASHRATE_1TH).toFixed(2) + " TH/s";
  if (hashrate > HASHRATE_1GH)
    return (hashrate / HASHRATE_1GH).toFixed(2) + " GH/s";
  if (hashrate > HASHRATE_1MH)
    return (hashrate / HASHRATE_1MH).toFixed(2) + " MH/s";
  if (hashrate > HASHRATE_1KH)
    return (hashrate / HASHRATE_1KH).toFixed(2) + " KH/s";
  else return hashrate.toFixed(2) + " H/s";
};

export const getHashrateNow = async () => {
  try {
    const response = await fetch(
      `${ALEPHIUM_API_URL}/blocks?page=1&reverse=false`
    );
    if (!response.ok)
      throw new Error(`ERROR FETCH HASHRATES NOW: ${response.status}`);
    const blockData = await response.json();
    const hashrateNow = blockData.blocks.at(0).hashRate;

    return getHashrateString(hashrateNow);
  } catch (error) {
    throw error;
  }
};

// console.log(await getHashrateNow());

export const getHashratesLast7D = async () => {
  const timestamp_now = new Date().getTime();
  try {
    const hashrateResponse = await fetch(
      `${ALEPHIUM_API_URL}/charts/hashrates?fromTs=${
        timestamp_now - TIMESTAMP_168H_MS
      }&toTs=${timestamp_now}&interval-type=hourly`
    );
    console.log(`${ALEPHIUM_API_URL}/charts/hashrates?fromTs=${
      timestamp_now - TIMESTAMP_168H_MS
    }&toTs=${timestamp_now}&interval-type=hourly`);
    if (!hashrateResponse.ok)
      throw new Error(`ERROR FETCH HASHRATES 24h: ${hashrateResponse.status}`);
    const data = await hashrateResponse.json();
    const hs = data.slice(data.length - 168).reverse().reduce(
      (acc, currHs, i) => {
        console.log(currHs);
        const hashrate = +currHs.hashrate;
        const hs1H = i < 1 ? hashrate : acc.hs1H;
        const hs3H = i < 3 ? acc.hs3H + hashrate : acc.hs3H;
        const hs6H = i < 6 ? acc.hs6H + hashrate : acc.hs6H;
        const hs1D = i < 24 ? acc.hs1D + hashrate : acc.hs1D;
        const hs3D = i < 72 ? acc.hs3D + hashrate : acc.hs3D;
        const hs7D = i < 168 ? acc.hs7D + hashrate : acc.hs7D;
        return { hs1H, hs3H, hs6H, hs1D, hs3D, hs7D };
      },
      { hs1H: 0, hs3H: 0, hs6H: 0, hs1D: 0, hs3D: 0, hs7D: 0 }
    );
    return {
      hs1H: getHashrateString(hs.hs1H),
      hs3H: getHashrateString(hs.hs3H / 3),
      hs6H: getHashrateString(hs.hs6H / 6),
      hs1D: getHashrateString(hs.hs1D / 24),
      hs3D: getHashrateString(hs.hs3D / 72),
      hs7D: getHashrateString(hs.hs7D / 168),
    };
  } catch (error) {
    throw error;
  }
};
// console.log(await getHashratesLast7D());

const findMaxMin = async (startTS, endTS, tmpMin, tmpMax) => {
  let max = tmpMax;
  let min = tmpMin;
  try {
    const response = await fetch(
      `${ALEPHIUM_API_URL}/charts/hashrates?fromTs=${startTS}&toTs=${endTS}&interval-type=hourly`
    );
    if (!response.ok) throw new Error(`ERROR FETCH HOURLY: ${response.status}`);
    const hashrates = await response.json();
    for (const hs of hashrates) {
      //dont include hashrates when DIFF BOMB was activated
      if (hs.timestamp > 1670508000000 && hs.timestamp < 1670616000000)
        continue;
      if (+hs.hashrate > max.hashrate)
        max = { hashrate: +hs.hashrate, timestamp: hs.timestamp };
      if (+hs.hashrate < min.hashrate)
        min = { hashrate: +hs.hashrate, timestamp: hs.timestamp };
    }
    return { min, max };
  } catch (error) {
    throw error;
  }
};

// function to init max and min hashrates
const storeMaxMin = async () => {
  try {
    let ts;
    let min = { hashrate: Number.MAX_VALUE, timestamp: null },
      max = { hashrate: 0, timestamp: null };
    for (
      ts = TIMESTAMP_BEGIN;
      ts < new Date().getTime();
      ts += HOURLY_LIMIT_MS
    ) {
      ({ min, max } = await findMaxMin(ts, ts + HOURLY_LIMIT_MS, min, max));
    }
    ts = ts - HOURLY_LIMIT_MS;
    const ts_now = new Date().getTime();
    const { max: tailMax, min: tailMin } = await findMaxMin(
      ts,
      ts_now,
      min,
      max
    );
    max = max.hashrate > tailMax.hashrate ? tailMax : max;
    min = min.hashrate < tailMin.hashrate ? tailMin : min;

    const ws_minmax = createWriteStream("./minmax.txt");
    ws_minmax.write(
      `lastTSchecked_${ts_now}\nmin_${min.hashrate}_${min.timestamp}\nmax_${max.hashrate}_${max.timestamp}`
    );
    console.log("storeMinMax: Write success!");
  } catch (error) {
    console.log(`Error occured: ${error.message}`);
    const ws_error = createWriteStream("./errors.txt", { flags: "a" });
    ws_error.write(`Error occured: ${error.message}`);
  }
};
// storeMaxMin();

export const getMinMax = async () => {
  try {
    let min, max, ts_last;

    // get old min and max from the file
    const rl = readline.createInterface({
      input: createReadStream("minmax.txt"),
      crlfDelay: Infinity,
    });
    rl.on("line", (line) => {
      if (line.includes("min")) {
        const [_, hashrate, timestamp] = line.split("_");
        min = { hashrate, timestamp };
      }
      if (line.includes("max")) {
        const [_, hashrate, timestamp] = line.split("_");
        max = { hashrate, timestamp };
      }
      if (line.includes("lastTSchecked")) {
        const [_, lastTS] = line.split("_");
        ts_last = lastTS;
      }
    });
    await once(rl, "close");

    // get new potential min and max hashrate between ts_last and now
    const ts_now = new Date().getTime();
    const { min: tmpMin, max: tmpMax } = await findMaxMin(
      ts_last,
      ts_now,
      min,
      max
    );
    if (tmpMax.hashrate > max.hashrate) max = tmpMax;
    if (tmpMin.hashrate < min.hashrate) min = tmpMin;

    // update minmax.txt
    const ws_minmax = createWriteStream("./minmax.txt");
    ws_minmax.write(
      `lastTSchecked_${ts_now}\nmin_${min.hashrate}_${min.timestamp}\nmax_${max.hashrate}_${max.timestamp}`
    );
    console.log("GetMinMax: Write success!");
    return {
      maxHs: getHashrateString(max.hashrate),
      minHs: getHashrateString(min.hashrate),
    };
  } catch (error) {
    throw error;
  }
};
// console.log(await getMinMax());
