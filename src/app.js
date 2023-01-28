import fetch from "node-fetch";
import { Telegraf } from "telegraf";
import { createWriteStream, createReadStream } from "node:fs";
import { once } from "node:events";
import * as readline from "node:readline";

import { getHashrateNow, getHashratesLast7D, getMinMax } from "./helpers.js";
import "../env.js";
function setTerminalTitle(title)
{
  process.stdout.write(
    String.fromCharCode(27) + "]0;" + title + String.fromCharCode(7)
  );
}
setTerminalTitle("Hashrate_bot");
const getFinalString = async (now = false) => {
  const hsNow = await getHashrateNow();
  const { hs1H, hs3H, hs6H, hs1D, hs3D, hs7D } = await getHashratesLast7D();
  const { maxHs, minHs } = await getMinMax();
  if (now)
    return (
      `Now: ${hsNow}\n` + `1h: ${hs1H}\n` + `3h: ${hs3H}\n` + `6h: ${hs6H}\n`
    );
  return (
    `6h: ${hs6H}\n` +
    `1d: ${hs1D}\n` +
    `3d: ${hs3D}\n` +
    `7d: ${hs7D}\n` +
    `Min(ever): ${minHs}\n` +
    `Max(ever): ${maxHs}`
  );
};
// console.log(await getFinalString());

const bot = new Telegraf(process.env.TOKEN);
bot.command("hashrate", async (ctx) => {
  const message = await getFinalString();
  await ctx.sendMessage(message);
});
bot.command("hashrate_now", async (ctx) => {
  const message = await getFinalString(true);
  await ctx.sendMessage(message);
});

bot.launch();
