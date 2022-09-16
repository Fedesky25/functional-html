import test from "ava";
import { render } from "posthtml-render";
import { HTMLComponent, componentify } from "../dist/index.js";

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
    i.truthy(c.render());
});

test("conditional: basics", async i => {
    const c = await componentify("test/conditional/basic.html");
    i.is(render(c.render({flag: true})), "true");
    i.is(render(c.render({flag: false})), "false");
});

test("conditional: cases after default are skipped", async i => {
    const c = await componentify("test/conditional/skip-after-def.html");
    i.is(render(c.render({value: 2})), "default");
});

test("conditional: wrong content", i => i.notThrowsAsync(() => componentify("test/conditional/wrong-content.html")));

test("conditional: no cases", i => i.notThrowsAsync(() => componentify("test/conditional/no-cases.html")));

test("conditional: empty condition", i => i.throwsAsync(() => componentify("test/conditional/empty-condition.html")));


test("each item", async i => {
    const comp = new HTMLComponent(`<link rel="attr" title="input">
<template>
    <each item in="input">
        \${item}
    </conditional>
</template>    
`, ".", "conditional");
    await comp.ready;
    const res = comp.render({input: [1,2,3]});
    const text = render(res);
    return i.is(text, "123");
});

test("each item and index", async i => {
    const comp = new HTMLComponent(`<link rel="attr" title="input">
<template>
    <each item index in="input">
        \${index}: \${item},
    </conditional>
</template>    
`, ".", "conditional");
    await comp.ready;
    const res = comp.render({input: ['a','b','c']});
    const text = render(res);
    return i.is(text, "0: a,1: b,2: c,");
});