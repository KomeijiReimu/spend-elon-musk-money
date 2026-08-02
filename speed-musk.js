// ==UserScript==
// @name         Spend Elon Musk Money Speedrun
// @namespace    https://www.arealme.com/
// @version      0.2.1
// @description  在页面上下文中执行已证明最少购买次数的 Spend Elon Musk Money 方案
// @author       musk speedrun
// @match        https://www.arealme.com/spend-elon-musk-money/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(() => {
  'use strict';

  // BEGIN REPLACEABLE PLAN
  // 已证明最优的 902 次方案之一；tools/solve_plan.py 可独立复核最优性。
  const SPEEDRUN_PLAN = Object.freeze({
    targetCents: 130000000000000n,
    expectedPurchases: 902n,
    pricesCents: Object.freeze([
      50n,
      150n,
      250n,
      400n,
      500n,
      900n,
      1300n,
      1800n,
      2500n,
      3500n,
      4900n,
      8000n,
      6350n,
      24900n,
      18000n,
      17900n,
      22900n,
      25000n,
      27000n,
      30000n,
      35000n,
      45000n,
      85000n,
      100000n,
      174900n,
      199900n,
      200000n,
      200000n,
      800000n,
      1000000n,
      1800000n,
      2170000n,
      5000000n,
      6930000n,
      8500000n,
      10000000n,
      15000000n,
      25000000n,
      30000000n,
      60000000n,
      78200000n,
      120000000n,
      180000000n,
      210900000n,
      260000000n,
      430000000n,
      550000000n,
      700000000n,
      1000000000n,
      4000000000n,
      8000000000n,
      8437500000n,
      10000000000n,
      20000000000n,
      45000000000n,
      55000000000n,
      70000000000n,
      100000000000n,
      150000000000n,
      300000000000n,
    ]),
    quantities: Object.freeze([
      1n, 1n, 1n, 1n, 1n, 2n, 1n, 1n, 1n, 1n,
      1n, 1n, 1n, 1n, 2n, 1n, 1n, 1n, 1n, 1n,
      1n, 2n, 1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n,
      1n, 1n, 1n, 1n, 1n, 1n, 2n, 1n, 1n, 1n,
      1n, 2n, 1n, 2n, 3n, 1n, 1n, 1n, 1n, 1n,
      1n, 1n, 1n, 1n, 1n, 2n, 2n, 2n, 803n, 30n,
    ]),
    limits: Object.freeze([
      Object.freeze({ item: 55n, max: 1n }),
      Object.freeze({ item: 60n, max: 30n }),
    ]),
  });
  // END REPLACEABLE PLAN

  const ITEM_COUNT = 60;
  const BEST_STORAGE_KEY = 'sm-elon-muskbest';
  const EXPECTED_BUNDLE_FILE = 'spend-money.js';
  const EXPECTED_BUNDLE_QUERY = '?v=20260507';
  const EXPECTED_BUNDLE_URL = `https://areal.me/static/libs/spend-money/${EXPECTED_BUNDLE_FILE}${EXPECTED_BUNDLE_QUERY}`;
  const GAME_PATH_PREFIX = '/spend-elon-musk-money/';
  const GAME_READY_TIMEOUT_MS = 15_000;
  const UNLOCK_TIMEOUT_MS = 10_000;
  const COMPLETION_TIMEOUT_MS = 10_000;
  const TURBO_MICROTASK_LIMIT = 12;
  const TURBO_HOOK_PAIRS = Object.freeze([
    Object.freeze({ state: 0, ref: 13, label: 'cart' }),
    Object.freeze({ state: 1, ref: 14, label: 'balance' }),
    Object.freeze({ state: 7, ref: 16, label: 'unlocked' }),
  ]);

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const pageDocument = pageWindow.document;
  let running = false;

  class SpeedrunError extends Error {
    constructor(message) {
      super(`[musk-speedrun] ${message}`);
      this.name = 'SpeedrunError';
    }
  }

  function fail(message) {
    throw new SpeedrunError(message);
  }

  function validatePlan() {
    const { pricesCents, quantities, limits, targetCents, expectedPurchases } = SPEEDRUN_PLAN;

    if (!Array.isArray(pricesCents) || pricesCents.length !== ITEM_COUNT) {
      fail(`计划价格长度必须为 ${ITEM_COUNT}，实际为 ${pricesCents?.length ?? '非数组'}`);
    }
    if (!Array.isArray(quantities) || quantities.length !== ITEM_COUNT) {
      fail(`计划数量长度必须为 ${ITEM_COUNT}，实际为 ${quantities?.length ?? '非数组'}`);
    }
    if (typeof targetCents !== 'bigint' || targetCents <= 0n || targetCents % 100n !== 0n) {
      fail('计划目标金额必须是正的整美元 BigInt 美分值');
    }
    if (typeof expectedPurchases !== 'bigint' || expectedPurchases <= 0n) {
      fail('计划总购买数必须是正 BigInt');
    }

    let amountCents = 0n;
    let purchases = 0n;
    for (let index = 0; index < ITEM_COUNT; index += 1) {
      const price = pricesCents[index];
      const quantity = quantities[index];
      if (typeof price !== 'bigint' || price <= 0n) {
        fail(`第 ${index + 1} 项价格不是正 BigInt`);
      }
      if (typeof quantity !== 'bigint' || quantity < 1n) {
        fail(`第 ${index + 1} 项数量不是至少为 1 的 BigInt`);
      }
      amountCents += price * quantity;
      purchases += quantity;
    }

    if (amountCents !== targetCents) {
      fail(`计划金额错误：${amountCents} 美分，不等于目标 ${targetCents} 美分`);
    }
    if (purchases !== expectedPurchases) {
      fail(`计划总购买数错误：${purchases}，预期 ${expectedPurchases}`);
    }

    if (!Array.isArray(limits) || limits.length !== 2) {
      fail('计划限购表必须只声明第 55 项和第 60 项');
    }
    const requiredLimits = new Map([
      ['55', 1n],
      ['60', 30n],
    ]);
    const seenLimits = new Set();
    for (const limit of limits) {
      if (!limit || typeof limit.item !== 'bigint' || typeof limit.max !== 'bigint') {
        fail('计划限购项的 item 和 max 必须都是 BigInt');
      }
      const key = limit.item.toString();
      if (seenLimits.has(key)) {
        fail(`计划限购表重复声明第 ${key} 项`);
      }
      seenLimits.add(key);
      if (!requiredLimits.has(key) || requiredLimits.get(key) !== limit.max) {
        fail(`不支持的限购声明：第 ${key} 项上限 ${limit.max}`);
      }
      const itemIndex = Number(limit.item - 1n);
      if (quantities[itemIndex] > limit.max) {
        fail(`第 ${key} 项计划数量 ${quantities[itemIndex]} 超过限购 ${limit.max}`);
      }
    }
    for (const key of requiredLimits.keys()) {
      if (!seenLimits.has(key)) {
        fail(`计划缺少第 ${key} 项限购声明`);
      }
    }

    return Object.freeze({
      amountCents,
      purchases,
      targetDollars: targetCents / 100n,
    });
  }

  function queryAll(selector) {
    return Array.from(pageDocument.querySelectorAll(selector));
  }

  function exactSafeInteger(value, label) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      fail(`${label} 必须是安全整数，实际为 ${String(value)}`);
    }
    return BigInt(value);
  }

  function readQuantity(input, itemNumber) {
    if (!input || typeof input.value !== 'string') {
      fail(`第 ${itemNumber} 项缺少 .item-input`);
    }
    if (input.readOnly !== true) {
      fail(`第 ${itemNumber} 项 .item-input 不再是 readonly`);
    }
    if (!/^(?:0|[1-9]\d*)$/.test(input.value)) {
      fail(`第 ${itemNumber} 项数量不是非负整数：${JSON.stringify(input.value)}`);
    }
    return BigInt(input.value);
  }

  function parsePriceCents(element, itemNumber) {
    const original = element?.textContent;
    if (typeof original !== 'string') {
      fail(`第 ${itemNumber} 项缺少 .item-cost 文本`);
    }
    const compact = original.replace(/[\s\u00a0\u202f]/g, '');
    const match = /^\$([0-9][0-9,]*)(?:\.([0-9]{1,2}))?$/.exec(compact);
    if (!match) {
      fail(`第 ${itemNumber} 项价格格式无法精确解析：${JSON.stringify(original.trim())}`);
    }

    const integerText = match[1];
    const commaFormatIsValid = !integerText.includes(',')
      ? /^(?:0|[1-9]\d*)$/.test(integerText)
      : /^(?:[1-9]\d{0,2})(?:,\d{3})+$/.test(integerText);
    if (!commaFormatIsValid) {
      fail(`第 ${itemNumber} 项价格千分位格式无效：${JSON.stringify(original.trim())}`);
    }

    const dollars = BigInt(integerText.replaceAll(',', ''));
    const fraction = (match[2] ?? '').padEnd(2, '0');
    return dollars * 100n + BigInt(fraction || '0');
  }

  function readProgress() {
    const progress = pageDocument.querySelector('.money-progress');
    if (!progress) {
      fail('找不到 .money-progress');
    }
    return progress;
  }

  function oneAnimationFrame(deadline, label) {
    return new Promise((resolve, reject) => {
      const remaining = deadline - pageWindow.performance.now();
      if (remaining <= 0) {
        reject(new SpeedrunError(`${label} 超时`));
        return;
      }

      let settled = false;
      const timeoutId = pageWindow.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new SpeedrunError(`${label} 超时`));
      }, remaining);
      pageWindow.requestAnimationFrame((timestamp) => {
        if (settled) return;
        settled = true;
        pageWindow.clearTimeout(timeoutId);
        resolve(timestamp);
      });
    });
  }

  async function waitByAnimationFrame(predicate, label, timeoutMs, checkImmediately = true) {
    const deadline = pageWindow.performance.now() + timeoutMs;
    if (checkImmediately && predicate()) return;

    while (pageWindow.performance.now() < deadline) {
      await oneAnimationFrame(deadline, label);
      if (predicate()) return;
    }
    fail(`${label} 超时`);
  }

  async function waitForGameReady() {
    await waitByAnimationFrame(
      () => queryAll('.item-buy').length >= 1
        && queryAll('.item-input').length >= 1
        && queryAll('.item-cost').length >= 1,
      '等待游戏首项',
      GAME_READY_TIMEOUT_MS,
    );
  }

  function assertExpectedPage() {
    if (pageWindow.location.origin !== 'https://www.arealme.com'
      || !pageWindow.location.pathname.startsWith(GAME_PATH_PREFIX)) {
      fail(`页面地址不匹配：${pageWindow.location.href}`);
    }
  }

  function assertFreshGame(planValidation) {
    const buttons = queryAll('.item-buy');
    const inputs = queryAll('.item-input');
    const costs = queryAll('.item-cost');
    if (buttons.length !== 1 || inputs.length !== 1 || costs.length !== 1) {
      fail(`需要全新页面：启动时应只有 1 个商品，当前按钮/数量/价格节点为 ${buttons.length}/${inputs.length}/${costs.length}`);
    }
    if (buttons[0].disabled) {
      fail('首项 Buy 按钮处于 disabled 状态');
    }
    const initialQuantity = readQuantity(inputs[0], 1);
    if (initialQuantity !== 0n) {
      fail(`需要全新页面：首项初始数量应为 0，实际为 ${initialQuantity}`);
    }

    const progress = readProgress();
    const maximum = exactSafeInteger(progress.max, '.money-progress.max');
    const balance = exactSafeInteger(progress.value, '.money-progress.value');
    if (maximum !== planValidation.targetDollars) {
      fail(`资金 max 错误：${maximum}，预期 ${planValidation.targetDollars}`);
    }
    if (balance !== maximum) {
      fail(`需要全新页面：初始余额 ${balance} 不等于 max ${maximum}`);
    }
    const receipt = pageDocument.querySelector('#receipt-modal');
    if (receipt?.open === true) {
      fail('需要全新页面：收据弹窗已经打开');
    }
  }

  function assertProgressiveDom(currentIndex) {
    const expectedVisible = currentIndex + 1;
    const buttons = queryAll('.item-buy');
    const inputs = queryAll('.item-input');
    if (buttons.length !== expectedVisible || inputs.length !== expectedVisible) {
      fail(`解锁第 ${expectedVisible} 项前 DOM 数量错误：按钮 ${buttons.length}、输入 ${inputs.length}，预期 ${expectedVisible}`);
    }
    for (let index = 0; index < currentIndex; index += 1) {
      const quantity = readQuantity(inputs[index], index + 1);
      if (quantity !== 1n) {
        fail(`解锁阶段第 ${index + 1} 项数量应为 1，实际为 ${quantity}`);
      }
    }
    const currentQuantity = readQuantity(inputs[currentIndex], currentIndex + 1);
    if (currentQuantity !== 0n) {
      fail(`解锁阶段第 ${currentIndex + 1} 项点击前数量应为 0，实际为 ${currentQuantity}`);
    }
    if (buttons[currentIndex].disabled) {
      fail(`解锁阶段第 ${currentIndex + 1} 项 Buy 按钮处于 disabled 状态`);
    }
    return buttons[currentIndex];
  }

  function baseClickHasRendered(itemIndex) {
    const expectedVisible = Math.min(itemIndex + 2, ITEM_COUNT);
    const buttons = queryAll('.item-buy');
    const inputs = queryAll('.item-input');
    if (buttons.length > expectedVisible || inputs.length > expectedVisible) {
      fail(`第 ${itemIndex + 1} 项点击后解锁过量：按钮 ${buttons.length}、输入 ${inputs.length}，最多应为 ${expectedVisible}`);
    }
    if (buttons.length < expectedVisible || inputs.length < expectedVisible) return false;

    const quantity = readQuantity(inputs[itemIndex], itemIndex + 1);
    if (quantity > 1n) {
      fail(`第 ${itemIndex + 1} 项基础点击后数量跳到 ${quantity}`);
    }
    return quantity === 1n;
  }

  function clickBuy(button, itemNumber) {
    if (!button?.isConnected || typeof button.click !== 'function') {
      fail(`第 ${itemNumber} 项 Buy 按钮不可点击或已脱离 DOM`);
    }
    if (button.disabled) {
      fail(`第 ${itemNumber} 项 Buy 按钮处于 disabled 状态`);
    }
    button.click();
  }

  async function unlockStable(onDispatch) {
    for (let index = 0; index < ITEM_COUNT; index += 1) {
      const button = assertProgressiveDom(index);
      clickBuy(button, index + 1);
      onDispatch();
      await waitByAnimationFrame(
        () => baseClickHasRendered(index),
        `稳定模式等待第 ${index + 1} 项渲染`,
        UNLOCK_TIMEOUT_MS,
        false,
      );
    }
  }

  function assertExpectedBundle() {
    const matchingScripts = Array.from(pageDocument.scripts).filter((script) => (
      !script.getAttribute('src') && script.textContent.includes(EXPECTED_BUNDLE_URL)
    ));
    if (matchingScripts.length !== 1) {
      fail(`极速模式仅支持动态导入 ${EXPECTED_BUNDLE_URL} 的页面；内联配置精确匹配数为 ${matchingScripts.length}`);
    }
  }

  function inspectTurboHooks() {
    const container = pageDocument.querySelector('#game-container');
    if (!container || !container.__k) {
      fail('极速模式私有结构不匹配：缺少 #game-container.__k');
    }
    const rootChildren = container.__k.__k;
    if (!Array.isArray(rootChildren) || !rootChildren[0]) {
      fail('极速模式私有结构不匹配：缺少 #game-container.__k.__k[0]');
    }
    const component = rootChildren[0].__c;
    if (!component || !component.__H || !Array.isArray(component.__H.__)) {
      fail('极速模式私有结构不匹配：缺少 #game-container.__k.__k[0].__c.__H.__');
    }

    const hooks = component.__H.__;
    if (hooks.length <= 16) {
      fail(`极速模式私有结构不匹配：hooks 长度 ${hooks.length}，必须覆盖索引 16`);
    }

    const inspected = [];
    for (const mapping of TURBO_HOOK_PAIRS) {
      const stateHook = hooks[mapping.state];
      const refHook = hooks[mapping.ref];
      if (!stateHook || !Array.isArray(stateHook.__)
        || stateHook.__.length !== 2 || typeof stateHook.__[1] !== 'function') {
        fail(`极速模式 ${mapping.label} state hook ${mapping.state} 结构不匹配`);
      }
      if (stateHook.__N !== undefined) {
        fail(`极速模式 ${mapping.label} state hook ${mapping.state} 仍有未提交状态`);
      }
      if (!refHook || !refHook.__ || typeof refHook.__ !== 'object'
        || Array.isArray(refHook.__)
        || !Object.prototype.hasOwnProperty.call(refHook.__, 'current')) {
        fail(`极速模式 ${mapping.label} ref hook ${mapping.ref} 结构不匹配`);
      }
      inspected.push({
        label: mapping.label,
        stateValue: stateHook.__[0],
        refObject: refHook.__,
      });
    }
    return inspected;
  }

  function synchronizeTurboRefs() {
    const inspected = inspectTurboHooks();
    for (const entry of inspected) {
      entry.refObject.current = entry.stateValue;
      if (!Object.is(entry.refObject.current, entry.stateValue)) {
        fail(`极速模式无法同步 ${entry.label} ref.current`);
      }
    }
  }

  function assertTurboBalanceHookMatchesProgress() {
    const inspected = inspectTurboHooks();
    const balance = inspected.find((entry) => entry.label === 'balance')?.stateValue;
    const progressValue = readProgress().value;
    if (typeof balance !== 'number' || !Number.isFinite(balance) || balance !== progressValue) {
      fail(`极速模式 balance state 与进度条不一致：state=${String(balance)} progress=${String(progressValue)}`);
    }
  }

  async function waitForTurboRender(itemIndex) {
    for (let turn = 1; turn <= TURBO_MICROTASK_LIMIT; turn += 1) {
      await Promise.resolve();
      if (baseClickHasRendered(itemIndex)) return turn;
    }
    fail(`极速模式第 ${itemIndex + 1} 项在 ${TURBO_MICROTASK_LIMIT} 个 Promise microtask 内未完成渲染`);
  }

  async function unlockTurbo(onDispatch) {
    assertExpectedBundle();
    assertTurboBalanceHookMatchesProgress();
    synchronizeTurboRefs();

    for (let index = 0; index < ITEM_COUNT; index += 1) {
      const button = assertProgressiveDom(index);
      clickBuy(button, index + 1);
      onDispatch();
      await waitForTurboRender(index);
      synchronizeTurboRefs();
    }
  }

  function verifyPricesAndBaseQuantities() {
    const buttons = queryAll('.item-buy');
    const inputs = queryAll('.item-input');
    const costs = queryAll('.item-cost');
    if (buttons.length !== ITEM_COUNT || inputs.length !== ITEM_COUNT || costs.length !== ITEM_COUNT) {
      fail(`完整解锁后节点数错误：按钮/数量/价格为 ${buttons.length}/${inputs.length}/${costs.length}，预期均为 ${ITEM_COUNT}`);
    }

    for (let index = 0; index < ITEM_COUNT; index += 1) {
      const actualPrice = parsePriceCents(costs[index], index + 1);
      const expectedPrice = SPEEDRUN_PLAN.pricesCents[index];
      if (actualPrice !== expectedPrice) {
        fail(`第 ${index + 1} 项价格变化：页面 ${actualPrice} 美分，计划 ${expectedPrice} 美分`);
      }
      const quantity = readQuantity(inputs[index], index + 1);
      if (quantity !== 1n) {
        fail(`完整解锁后第 ${index + 1} 项基础数量应为 1，实际为 ${quantity}`);
      }
      if (buttons[index].disabled && SPEEDRUN_PLAN.quantities[index] > 1n) {
        fail(`第 ${index + 1} 项仍需追加购买，但按钮已 disabled`);
      }
    }
    return buttons;
  }

  function dispatchRemainingPurchases(buttons, onDispatch) {
    for (let index = 0; index < ITEM_COUNT; index += 1) {
      const finalQuantity = SPEEDRUN_PLAN.quantities[index];
      for (let quantity = 1n; quantity < finalQuantity; quantity += 1n) {
        clickBuy(buttons[index], index + 1);
        onDispatch();
      }
    }
  }

  function scheduleVisualOrTimer(callback) {
    let fired = false;
    let animationFrameId = 0;
    let timerId = 0;
    const run = () => {
      if (fired) return;
      fired = true;
      if (animationFrameId) pageWindow.cancelAnimationFrame(animationFrameId);
      if (timerId) pageWindow.clearTimeout(timerId);
      callback();
    };
    animationFrameId = pageWindow.requestAnimationFrame(run);
    timerId = pageWindow.setTimeout(run, 16);
  }

  function waitForCompletion() {
    const started = pageWindow.performance.now();
    return new Promise((resolve, reject) => {
      const poll = () => {
        try {
          const progress = readProgress();
          const receipt = pageDocument.querySelector('#receipt-modal');
          const receiptOpen = receipt?.open === true;
          if (progress.value === 0 && receiptOpen) {
            resolve(pageWindow.performance.now());
            return;
          }
          if (pageWindow.performance.now() - started >= COMPLETION_TIMEOUT_MS) {
            reject(new SpeedrunError(
              `等待完成超时：progress.value=${String(progress.value)}，receipt.open=${receiptOpen}`,
            ));
            return;
          }
          scheduleVisualOrTimer(poll);
        } catch (error) {
          reject(error);
        }
      };
      scheduleVisualOrTimer(poll);
    });
  }

  function readBestTime() {
    try {
      return pageWindow.localStorage.getItem(BEST_STORAGE_KEY);
    } catch (error) {
      fail(`无法读取 localStorage ${BEST_STORAGE_KEY}：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function readOfficialText(receipt) {
    const text = typeof receipt.innerText === 'string' ? receipt.innerText : receipt.textContent;
    return String(text ?? '').replace(/\s+/g, ' ').trim();
  }

  function verifyFinalState(planValidation) {
    const inputs = queryAll('.item-input');
    if (inputs.length !== ITEM_COUNT) {
      fail(`完成后 .item-input 数量为 ${inputs.length}，预期 ${ITEM_COUNT}`);
    }

    const finalQuantities = [];
    let finalAmountCents = 0n;
    let finalPurchases = 0n;
    for (let index = 0; index < ITEM_COUNT; index += 1) {
      const actual = readQuantity(inputs[index], index + 1);
      const expected = SPEEDRUN_PLAN.quantities[index];
      if (actual !== expected) {
        fail(`完成后第 ${index + 1} 项数量错误：${actual}，预期 ${expected}`);
      }
      finalQuantities.push(actual);
      finalAmountCents += actual * SPEEDRUN_PLAN.pricesCents[index];
      finalPurchases += actual;
    }
    if (finalAmountCents !== planValidation.amountCents) {
      fail(`完成后金额错误：${finalAmountCents} 美分，预期 ${planValidation.amountCents} 美分`);
    }
    if (finalPurchases !== planValidation.purchases) {
      fail(`完成后购买数错误：${finalPurchases}，预期 ${planValidation.purchases}`);
    }

    const progress = readProgress();
    const progressBalance = exactSafeInteger(progress.value, '完成后 .money-progress.value');
    if (progressBalance !== 0n) {
      fail(`完成后余额不为 0：${progressBalance}`);
    }
    const receipt = pageDocument.querySelector('#receipt-modal');
    const receiptOpen = receipt?.open === true;
    if (!receiptOpen) {
      fail('完成后 #receipt-modal.open 不为 true');
    }

    return { finalQuantities, progressBalance, receiptOpen, receipt };
  }

  function milliseconds(value) {
    return Number(value.toFixed(3));
  }

  async function execute(mode) {
    assertExpectedPage();
    const planValidation = validatePlan();
    await waitForGameReady();
    assertFreshGame(planValidation);

    const bestBefore = readBestTime();
    let dispatched = 0n;
    const onDispatch = () => {
      dispatched += 1n;
    };
    const dispatchStarted = pageWindow.performance.now();

    if (mode === 'stable') {
      await unlockStable(onDispatch);
    } else {
      await unlockTurbo(onDispatch);
    }
    const unlockFinished = pageWindow.performance.now();

    const buttons = verifyPricesAndBaseQuantities();
    const burstStarted = pageWindow.performance.now();
    dispatchRemainingPurchases(buttons, onDispatch);
    const burstFinished = pageWindow.performance.now();

    if (dispatched !== planValidation.purchases) {
      fail(`实际调用 button.click() ${dispatched} 次，计划要求 ${planValidation.purchases} 次`);
    }

    const completionFinished = await waitForCompletion();
    const finalState = verifyFinalState(planValidation);

    // 给页面的 passive effects 一次有界的绘制机会，再读取精确最佳毫秒。
    await oneAnimationFrame(pageWindow.performance.now() + 1_000, '等待完成后的 passive effects');
    const bestAfter = readBestTime();

    return {
      mode,
      planPurchases: planValidation.purchases.toString(),
      unlockMs: milliseconds(unlockFinished - dispatchStarted),
      burstMs: milliseconds(burstFinished - burstStarted),
      dispatchMs: milliseconds(burstFinished - dispatchStarted),
      completionMs: milliseconds(completionFinished - dispatchStarted),
      progressBalance: finalState.progressBalance.toString(),
      receiptOpen: finalState.receiptOpen,
      bestBefore,
      bestAfter,
      officialText: readOfficialText(finalState.receipt),
      finalQuantities: finalState.finalQuantities.map((quantity) => quantity.toString()),
    };
  }

  async function run(options = {}) {
    const mode = typeof options === 'string' ? options : options?.mode ?? 'stable';
    if (mode !== 'stable' && mode !== 'turbo') {
      fail(`mode 必须是 stable 或 turbo，实际为 ${JSON.stringify(mode)}`);
    }
    if (running) {
      fail('已有一次测速正在运行，请等待完成或刷新页面');
    }

    running = true;
    try {
      return await execute(mode);
    } finally {
      running = false;
    }
  }

  async function runFromMenu(mode) {
    try {
      const result = await run({ mode });
      pageWindow.console.table({
        mode: result.mode,
        purchases: result.planPurchases,
        unlockMs: result.unlockMs,
        burstMs: result.burstMs,
        dispatchMs: result.dispatchMs,
        completionMs: result.completionMs,
        balance: result.progressBalance,
        receiptOpen: result.receiptOpen,
        bestBefore: result.bestBefore,
        bestAfter: result.bestAfter,
      });
      pageWindow.console.log('[musk-speedrun] result', result);
      pageWindow.alert(
        `${mode === 'stable' ? '稳定' : '极速'}模式完成：${result.completionMs} ms\n`
        + `余额 ${result.progressBalance}，购买 ${result.planPurchases} 次`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pageWindow.console.error('[musk-speedrun] failed', error);
      pageWindow.alert(`测速失败：${message}`);
    }
  }

  const api = Object.freeze({
    run,
    stable: () => run({ mode: 'stable' }),
    turbo: () => run({ mode: 'turbo' }),
  });
  pageWindow.muskMoneySpeedrun = api;

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('稳定模式', () => runFromMenu('stable'));
    GM_registerMenuCommand('极速模式', () => runFromMenu('turbo'));
  }
})();
