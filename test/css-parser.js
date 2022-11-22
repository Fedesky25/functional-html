const test = require("ava").default;
const { tokenizeCSS } = require("../dist/css-parser");

test("css: simple", i => {
    const t = tokenizeCSS(".class { font-size: 3rem; }");
    i.deepEqual(t, [{ rule: '', outside: ".class", inside: "font-size: 3rem;"}]);
});

test("css: extra spaces", i => {
    const t = tokenizeCSS("  .class   {  font-size: 3rem;  }   ");
    i.deepEqual(t, [{ rule: '', outside: ".class", inside: "font-size: 3rem;"}]);
});

test("css: multiple selctors", i => {
    const t = tokenizeCSS(".class, *, [data-naso] { font-size: 3rem; }");
    i.deepEqual(t, [{ rule: '', outside: ".class, *, [data-naso]", inside: "font-size: 3rem;"}]);
});

test("css: nesting", i => {
    const t = tokenizeCSS(`
@media (min-width: 30rem) {
    p {
        font-size: 3rem;
        color: red;
    }
}`);
    i.deepEqual(t, [
        {
            rule: "media",
            outside: "(min-width: 30rem)",
            inside: [
                {
                    rule: '',
                    outside: 'p',
                    inside: `font-size: 3rem;\n        color: red;`
                }
            ]
        }
    ])
});

test("css: simple + nesting", i => {
    const t = tokenizeCSS(`
p {
    color: black;
}

@media (min-width: 30rem) {
    p {
        font-size: 3rem;
        color: red;
    }
}`);
    i.deepEqual(t, [
        {
            rule: '',
            outside: "p",
            inside: "color: black;"
        },
        {
            rule: "media",
            outside: "(min-width: 30rem)",
            inside: [
                {
                    rule: '',
                    outside: 'p',
                    inside: `font-size: 3rem;\n        color: red;`
                }
            ]
        }
    ])
});

test("css: oneliners @ rules", i => {
    const t = tokenizeCSS(`
@charset "UTF-8";
@import url("ciao babbo natale");
@layer nasello;`);
    i.deepEqual(t, [
        {
            rule: "charset",
            outside: '"UTF-8"',
            inside: null
        },
        {
            rule: "import",
            outside: 'url("ciao babbo natale")',
            inside: null
        },
        {
            rule: "layer",
            outside: "nasello",
            inside: null
        }
    ])
});

test("css: multiple nesting", i => {
    const t = tokenizeCSS(`
@media screen {
    @media screen {
        @media screen {
            p {
                color: black;
            }
        }
    }
}`);
    i.deepEqual(t, [{
        rule: "media",
        outside: "screen",
        inside:[{
            rule: "media",
            outside: "screen",
            inside:[{
                rule: "media",
                outside: "screen",
                inside: [{
                    rule: '',
                    outside: 'p',
                    inside: "color: black;"
                }]
            }]
        }]
    }])
});