import test from "node:test";
import assert from "node:assert/strict";
import type {KeyboardEvent} from "react";
import {submitMessageShortcut} from "../lib/message-entry.ts";

function press(overrides: Record<string, unknown> = {}, fieldOverrides: Record<string, unknown> = {}) {
  let submissions = 0, prevented = false;
  const event = {
    key: "Enter", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    repeat: false, defaultPrevented: false, nativeEvent: {isComposing: false, keyCode: 13},
    currentTarget: {value: "A question\nwith context", disabled: false,
      form: {requestSubmit() { submissions++; }}, ...fieldOverrides},
    preventDefault() { prevented = true; }, ...overrides,
  };
  submitMessageShortcut(event as unknown as KeyboardEvent<HTMLTextAreaElement>);
  return {submissions, prevented};
}

test("plain Enter keeps multiline writing; Control/Command+Enter uses form validation and submit", () => {
  assert.deepEqual(press(), {submissions: 0, prevented: false});
  for (const modifier of ["ctrlKey", "metaKey"]) {
    assert.deepEqual(press({[modifier]: true}), {submissions: 1, prevented: true});
  }
});

test("sending shortcut cannot interrupt composition, repeat sends, or consume other editing shortcuts", () => {
  for (const override of [
    {nativeEvent: {isComposing: true, keyCode: 13}},
    {nativeEvent: {isComposing: false, keyCode: 229}},
    {repeat: true}, {defaultPrevented: true}, {shiftKey: true}, {altKey: true}, {key: "a"},
  ]) assert.deepEqual(press({ctrlKey: true, ...override}), {submissions: 0, prevented: false});
});

test("blank, disabled, and detached message fields cannot send", () => {
  for (const field of [{value: " \n "}, {disabled: true}, {form: null}]) {
    assert.deepEqual(press({ctrlKey: true}, field), {submissions: 0, prevented: true});
  }
});
