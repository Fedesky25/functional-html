const test = require("ava").default;
const { render } = require("posthtml-render");
const { createComponentFrom, componentify } = require("../dist/index.js");

test("throws on invalid path", async i => {
    const c = componentify("test/unexistant.html");
    await i.throwsAsync(c);
});

test("throws on wrong extension", async i => {
    const c = componentify("test/index.txt");
    await i.throwsAsync(c);
})

test("throws on empty template", async i => {
    const c = componentify("test/NoTemplate.html");
    await i.throwsAsync(c);
});

test("component renders", async i => {
    const c = await componentify("test/Simple.html");
    i.truthy(c({},{}));
});

test("conditional: basics", async i => {
    const c = await componentify("test/conditional/basic.html");
    i.is(render(c({flag: true}, {})), "true");
    i.is(render(c({flag: false}, {})), "false");
});

test("conditional: cases after default are skipped", async i => {
    const c = await componentify("test/conditional/skip-after-def.html");
    i.is(render(c({value: 2},{})), "default");
});

test("conditional: wrong content", i => i.throwsAsync(() => componentify("test/conditional/wrong-content.html")));

test("conditional: no cases", i => i.throwsAsync(() => componentify("test/conditional/no-cases.html")));

test("conditional: empty condition", i => i.throwsAsync(() => componentify("test/conditional/empty-condition.html")));

test("each: empty", async i => {
    const c = await componentify("test/each/empty.html");
    i.is(render(c()), "");
});

test("each: no item", async i => {
    const c = await componentify("test/each/no-item.html");
    i.is(render(c()), "");
});

test("each: only index", async i => {
    const c = await componentify("test/each/only-index.html");
    i.is(render(c()), "012");
});

test("each: not-array", async i => {
    const c = await componentify("test/each/not-array.html");
    i.throws(() => c());
});

