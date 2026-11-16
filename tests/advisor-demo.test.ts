import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoPortfolio } from '../src/lib/engine';
import { demoExplanation } from '../src/lib/advisor';

const state = demoPortfolio(new Date('2026-11-13T12:00:00.000Z'));

test('different questions get different demo answers', () => {
  const questions = ['hello', 'Should I buy Tesla?', 'What is an index fund?', 'What is the S&P 500?', 'How does auto-invest work?', 'Is investing risky?', 'How does compound interest work?', 'How are my investments doing?', 'How close am I to my goal?', 'How much could I save in six months?', 'How does a round-up work?', 'Explain my Sports Lab limits.', 'How does this app work?', 'thanks!'];
  const answers = questions.map(q => demoExplanation(q, state));
  assert.equal(new Set(answers).size, questions.length, 'every question should get its own answer');
});

test('unrecognized questions get an honest fallback instead of an unrelated answer', () => {
  for (const q of ['What is the capital of France?', 'asdfgh']) {
    const answer = demoExplanation(q, state);
    assert.match(answer, /can’t answer that one in demo mode/);
    assert.doesNotMatch(answer, /expected value/);
  }
});

test('demo answers never recommend a specific purchase', () => {
  assert.match(demoExplanation('Which stock should I buy?', state), /can’t tell you what to buy/);
  assert.match(demoExplanation('Should I sell Apple?', state), /can’t tell you what to buy/);
});

test('words containing topic keywords do not trigger the wrong topic', () => {
  assert.match(demoExplanation('How close am I to my goal?', state), /Your goal is/);
});
