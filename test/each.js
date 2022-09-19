const test = require("ava").default;
const { render } = require("posthtml-render");
const { componentify } = require("../dist/index.js");

test("each: empty", async i => {
    const c = await componentify("test/each/empty.html");
    i.is(render(c({})), "");
});

test("each: no item", async i => {
    const c = await componentify("test/each/no-item.html");
    i.is(render(c({})), "aaa");
});

test("each: only index", async i => {
    const c = await componentify("test/each/only-index.html");
    i.is(render(c({})), "012");
});

test("each: not-array", async i => {
    const c = await componentify("test/each/not-array.html");
    i.throws(() => c({}));
});