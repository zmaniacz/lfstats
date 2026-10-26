// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHeaderTime } from "./pdf-header-time";

test("month-first header", () => {
  assert.equal(
    parseHeaderTime(
      "Mission Scorecard\nSpace Marines 5 - 15 - R&G\n6:10pm Oct-2-2017\nDyscoMonkee",
    ),
    "2017-10-02 18:10:00",
  );
});

test("day-first header", () => {
  assert.equal(
    parseHeaderTime("Mission Scorecard\nSpace Marines 5\n7:55pm 10-Nov-2019\nGdsrvt"),
    "2019-11-10 19:55:00",
  );
});

test("midnight and noon hours", () => {
  assert.equal(parseHeaderTime("12:54am Jul-22-2015"), "2015-07-22 00:54:00");
  assert.equal(parseHeaderTime("12:54pm Jan-17-2018"), "2018-01-17 12:54:00");
  assert.equal(parseHeaderTime("1:20am Jan-4-2017"), "2017-01-04 01:20:00");
});

test("ad copy before the header time is ignored", () => {
  assert.equal(
    parseHeaderTime(
      "LASERFORCE MISSION SCORECARD\nSpace Marines 5\n5:47pm 17-Sep-2017\nSpecial Events: Thurs 5.45pm - 9.45pm",
    ),
    "2017-09-17 17:47:00",
  );
});

test("no header time", () => {
  assert.equal(parseHeaderTime("Mission Scorecard\nSpace Marines 5"), null);
  assert.equal(parseHeaderTime("13:10pm Oct-2-2017"), null);
  assert.equal(parseHeaderTime("6:10pm Foo-2-2017"), null);
});
