const test = require("ava").default;
const { render } = require("posthtml-render");
const { createComponentFrom } = require("../dist/index");

const url = "test/test.html";

/**
 * Slot Test 
 * @param {string} str component body
 */
function st(str) {
    return createComponentFrom(`<link rel="import" href="./slot-test.html" as="st"><template><st>${str}</st></template>`, url);
}

test("component: self closing", async i => {
    const c = await createComponentFrom(`<link rel="import" href="./slot-test.html" as="st"><template><st /></template>`, url);
    const r = render(c({}));
    i.is(r,"default");
});

test("slot: self closing", async i => {
    const c = await createComponentFrom("<template><slot name=\"body\"/></template>", url);
    const html = render(c({},{body: "ciao"})); 
    i.is(html, "ciao");
});

test("slot: default value", async i => {
    const c = await st("");
    const r = render(c({}));
    i.is(r, "default");
});

test("fragment: self closing", async i => {
    const c = await st('<fragment slot="body" />');
    const r = render(c({}));
    i.is(r,"");
});

test("fragment: unnamed", async i => {
    await i.throwsAsync(st("<fragment />"));
    await i.throwsAsync(st("<fragment>content</fragment>"));
});

test("fragment: wrong name", async i => {
    const c = await st('<fragment slot="rombo"></fragment>');
    const ast = c({});
    i.is(render(ast),"default");
});

test("fragment: empty", async i => {
    const c = await st('<fragment slot="body"></fragment>');
    const r = render(c({}));
    i.is(r,"");
});

test("fragment: filled", async i => {
    const c = await st('<fragment slot="body">text</fragment>');
    const r = render(c({}));
    i.is(r,"text");
});

test("fragment: multiple with same name", async i => {
    const p = st('<fragment slot="body">text1</fragment><fragment slot="body">text2</fragment>');
    await i.throwsAsync(p, { message: /^Slots cannot be defined more than once/ });
});
