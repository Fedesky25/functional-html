# Functional HTML

Start using HTML/XML as components with js expression! This is a small typescript package that allows you to convert html files into component functions that generate standard PostHTML [Abstract Syntax Tree](https://www.wikiwand.com/en/Abstract_syntax_tree) (AST), which can be postprocessed and rendered.

## Example 

A `Navbar.html` file:

```html
<link rel="prop" title="page">
<template>
    <nav>
        <a href="/"><img src="./logo.png" alt="Logo"></a>
        <ul class="links">
            <li class:active="page === 'home'">Home</li>
            <li class:active="page === 'about'">About</li>
        </ul>
    </nav>
</template>
```

An `index.html` file:

```html
<link rel="import" href="./Navbar.html">
<link rel="prop" title="things">
<template>
    <Navbar page="about" />
    <main>
        <h1>About us</h1>
        <p>
            <conditional>
                <fragment if="things.length === 0">There's nothing</fragment>
                <fragment if="things.length < 5">We have ${things.length} things to tell you:</fragment>
                <fragment else>There are too many things to tell you</fragment>
            </conditional>
        </p>
        <ul>
            <each item in="things">
                <li>${item}</li>
            </each>
        </ul>
    </main>
</template>
```

By running the following

```js
import { Builder } from "html-components";


const builder = new Builder();
const index = await builder.componentify("./index.html");
index({
    things: ["first", "second"]
});
```

Results in an AST which rendered looks like:

```html
<nav><a href="/"><img src="./logo.png" alt="Logo"></a><ul class="links"><li>Home</li><li class="active">About</li></ul></nav><h1>About us</h1>We have 2 things to tell you:<ul><li>first</li><li>second</li></ul>
```

## Installation

```
npm install functional-html
```

## API 

### Builder

Class that acts as a builder of component functions. It caches components to avoid parsing the same depencies twice.

#### constructor

```js
import { Builder } from "functional-html";

const builder = new Builder(root, globals);
```

| argument | description | default |
| :------: | ----------- | :-----------: |
| `root`   | Root path to all your components | `"/"` |
| `globals`| Object available to every component | `{}` |

#### methods

All public methods return promises that resove into a component object having properties: 

 - `slot`: the slot type of the component (see [Component slots](#component-slots))
 - `ast`: the component function 

```js 
const { ast, slot } = await builder.componentify(path);
const { ast, slot } = await builder.from(text, path);
```

| method | description |
| :----: | ----------- |
| `componentify` | parses the html file with the provided path and recursively all its dependecies |
| `from` | parses the provided text as if it was a file with the provided path, i.e. all dependencies are resolved from that path |

### Watcher

Watching files and re-parsing them is also supported.

```js
import { createWatcher } from "functional-html"

const watch = createWatcher(root, globals, timeout);

watch(
    path,
    (ast, slot) => {
        // do stuff with component function
    },
    (errors) => {
        // do stuff with encountered errors
    }
);
```

### createWatcher

| argument | description | default |
| :------: | ----------- | :-----------: |
| `root`   | Root path to all your components | `"/"` |
| `globals`| Object available to every component | `{}` |
| `timeout`| How many ms the parsing process of a file is debounced when changed | `500` |

### watch function 

| argument | description |
| :------: | ----------- |
| `path`   | Root path to all your components |
| `callback`| Callback function invoked with the component function and slot type when all went well after a file change |
| `onerror`| Callback function invoked with the list of errors (instances of `Error`) encountered when parsing files |

## Component function

The function compiled from a functional HTML component. It returns valid PostHTML [Abstract Syntax Tree](https://www.wikiwand.com/en/Abstract_syntax_tree) (AST), which can be then rendered.

| argument | description | default |
| :------: | ----------- | :-----------: |
| `props`  | Props object passed to the component |  |
| `slots`  | Slots object (see [Component slots](#component-slots)) | `undefined` |

## Syntax

Each file describing a valid html component must have as direct child a single `template` tag.
Other valid direct children are `link` tags with `rel` attribute set to `import` or `prop`.
The HTML code inside the template has "superpowers", described in the following sections.

 1. [Declaring props](#declaring-props)
 2. [Value interpolation](#value-interpolation)
 4. [Toggle classes](#toggle-classes)
 3. [Conditional statement](#conditional-statement)
 4. [Dynamic tag](#dynamic-tag)
 5. [Each statement](#each-statement)
 6. [Importing component](#importing-components)
 7. [Using components](#using-components)
 8. [Component slots](#component-slots)

> **Disclaimer** - 
> Any JavaScript expression inside the HTML component files is **not** checked. This means that any invalid or possibly-error-throwing expression will make the HTML compilation throw that error and fail.
> There are plans of a *DEV* mode which wraps any expression and intercepts any error, but the implementation is not straightforward and some compromises must be made (especially on performance). 

### Declaring props

Props can be passed to any component function as the first argument, they are an object with string key and any value. Inside the template, props are always accessible inside the `props` variable, but to ease their use one can declare them like so:

```html
<link rel="prop" title="things">
<link rel="prop" title="flag">
```

Which is translated into the js function

```js
function(props, slots) {
    // ...
    const { things, flag } = props;
    // ...
    return /* some AST */;
}
```

Therefore, the name of each declared prop must be a valid js variable name.

### Value interpolation

Inside text and attribute value of each tag you can interpolate any valid js expression using the `${<expression>}` notation.

```html
<link rel="prop" title="value">
<template>
    <p data-value="${value}">The value is: ${value.toFixed(2)}</p>
</template>
```

### Toggle classes

In addition to the value interpolation inside the attribute `class`, you can also use the directive `class:name="condition"`, inspired by [svelte](https://svelte.dev/), to toggle a class on a element.
The shorthand notation `class:name` stands for `class:name="name"`.

```html
<link rel="prop" title="text">
<link rel="prop" title="dark">
<template>
    <div class="card" class:dark>
        <p class:empty="!text">${text || "Empty card"}</p>
    </div>
</template>
```

### Conditional statement

The `conditional` tag allows conditional rendering of its children. In particular, any direct child must specify an `if` attribute with any js expression: the first child with truthy condition is rendered. An `else` attribute can be used insted of the `if` to denote the child to be rendered if all previous are falsey. When grouping together multiple tags or strings, use a `fragment` node.

```html
<link rel="prop" title="msg">
<template>
    <conditional>
        <fragment if="!msg">Nothing here</fragment>
        <p if="typeof msg === 'string'">We have a message for you: ${msg}</p>
        <fragment else>Something is off...</fragment>
        <fragment if="true">This will never be evaluated</fragment>
    </conditional>
</template>
```

### Dynamic tag

The `dyn` node tag allows you to specify the tag name of a node at compile time. 

```html
<link rel="prop" title="name">

<template>
    <dyn tag="name || 'p'" class="text" data-attr="custom attribute">yout text</dyn>
<template>
```

### Each statement 

The `each` tag allows looping though an array and rendering its children for each item.

```html
<link rel="prop" title="cards">
<template>
    <each item="card" index="i" of="cards">
        <div class="card" class:card-colored="card.colored">
            <h3 class="card__title">${card.title}</h3>
            <p class="card__text">${card.text}</p>
            <span>#${i}</span>
        </div>
    </each>
</template>
```

| attribute | description | default | can be omitted? |
| :-------: | ----------- | :-----: | :-------: |
| `of`, `array` | expression of the array | | no |
| `item` | name of the item of the array| item | if `index` is not |
| `index` | index of the item of the array| index | if `item` is not |

### Importing components

Importing is done though a `link` tag with rel attribute set to `import`:

```html 
<link rel="import" href="path/to/your/component.html">
<link rel="import" href="path/to/your/other/component.html" as="second-component">
```

In the first case the component will be available in the template with name `component`, i.e. the basename of the file. In the second case, it will be available under the name `second-component`.

### Using components

Imported components are treated as HTML tags, but with the passibility to pass them props (and slots, next section). Props can be passed as if they were attribute of a normal tag: by default they are strings, but you can pass any javascript value by using the `@` character.

```html
<link rel="import" href="./Navigation.html">
<link rel="import" href="./Complex.html">
<link rel="import" href="./Card.html">
<link rel="import" href="./Footer.html">

<link rel="prop" title="number">
<link rel="prop" title="type">
<link rel="prop" title="complex_data">

<template>
    <Navigation page="blog" />
    <!-- props = { page = "blog" } -->

    <Complex f:spread="complex_data" />
    <!-- props = complex_data -->
    
    <Complex f:spread="complex_data" property="4" />
    <!-- props = { property: "4", ...complex_data } -->
    
    <Card title="${type}: Who are we?" authors="@ ['Beppe', 'Giovanna']" />
    <!-- props = { title: `${type}: Who are we?`, authors: ['Bepper', 'Giovanna'] } -->
    
    <Footer page-count="@ number" />
    <!-- props = { page_count: number } -->
</template>
```

### Component slots

Finally components can accept slots, html code inserted in specified positions. Depending on the slots present (or not) in a component, different cases occur and different values are needed as second argument of the component function. The slot type is retrievable through the `slotType` readonly property of the component function.

| `slotType` | meaning | second argument | direct children |
| :--------: | ------- | --------------- | --------------- |
| `"none"`   | no slots | void (anyway not used) | are skipped
| `"single"` | only one unnamed slot | valid AST | define the slot |
| `"multiple"` | one or more named slots | object with string keys and AST values | must have a `slot` attribute

Whether a component has unnamed or named slots, the same slot can appear multiple times inside it and their content define the default value. In the importer, however, the slot can be defined only once.

#### Multi-slotted components

A few more words must be spent on component with slot type of multiple. The definition of any named slot is inside a `fragment` node, which must have a slot attribute. When a passed named slot is a single node, the `fragment` wrapping can be skipped and the node (with a slot attribute) can be a direct child of the component node.

If a declared slot is not defined in the component node (through a fragment or node), its default value is used.
Defining in the component node a non-declared slot has no effect but useless expression evaulation.
Declaring an empty `fragment` node (even self closing) is equivalent to discarding the default value and replacing empty.

#### Example

```html
<!-- Cool-link.html -->
<link rel="prop" title="href">
<link rel="prop" title="text">
<a template href="${href}">
    <div class="border-1"></div>
    <span class="text">${text}</span>
    <div class="border-2"></div>
</a>

<!-- Single.html -->
<link rel="prop" title="twice">
<template>
    <slot />
    <conditional>
        <slot if="twice">
            <p>This slot has a default value, while the first one didn't</p>
        </slot>
    </conditional>
<template>

<!-- Article.html -->
<link rel="prop" title="twice">
<div template class="container">
    <h3><slot name="title" /></h3>
    <div class="text">
        <slot name="text">There's nothing here</slot>
    </div>
</div>

<!-- page.html -->
<link rel="import" href="./Component.html">
<link rel="import" href="./Cool-link.html">
<link rel="import" href="./Single.html">
<template>
    <Single double="@ true">jar</Single>
    <Single double="@ true"/>
    <hr class="divisor">
    <Article>
        <fragment slot="title">First Title</fragment>
        <fragment slot="text">
            <p>Lorem ipsum dolor sit amet consectetur adipisicing elit.</p>
            <ul>
                <li>first item</li>
                <li>second item</li>
                <li>third item</li>
            </ul>
        </fragment>
    </Article>
    <Article>
        <fragment slot="title">Second Title</fragment>
        <fragment slot="text">
            <p>Lorem ipsum dolor sit amet consectetur adipisicing elit.</p>
            <Cool-link href="./about" text="Discover more" />
        </fragment>
    </Article>
    <Article>
        <fragment slot="title">Third Title</fragment>
        <p slot="text">Lorem ipsum dolor sit amet consectetur adipisicing elit.</p>
    </Article>
    <Article>
        <fragment slot="title">Fourth Title</fragment>
    </Article>
</template>

<!-- Result (prettified) -->
jarjar
<p>This slot has a default value, while the first one didn't</p>
<hr class="divisor">
<div class="container">
    <h3>First Title</h3>
    <div class="text">
        <p>Lorem ipsum dolor sit amet consectetur adipisicing elit.</p>
        <ul>
            <li>first item</li>
            <li>second item</li>
            <li>third item</li>
        </ul>
    </div>
</div>
<div class="container">
    <h3>Second Title</h3>
    <div class="text">
        <p>Lorem ipsum dolor sit amet consectetur adipisicing elit.</p>
        <a href="./about">
            <div class="border-1"></div>
            <span class="text">Discover more</span>
            <div class="border-2"></div>
        </a>
    </div>
</div>
<div class="container">
    <h3>Third Title</h3>
    <div class="text">
        <p>Lorem ipsum dolor sit amet consectetur adipisicing elit.</p>
    </div>
</div>
<div class="container">
    <h3>Fourth Title</h3>
    <div class="text">There's nothing here</div>
</div>
```

## Known issues

 - imported components name clashing
 - prop name can be js keywords
 - no prop type checking or hinting

## Future features

Depending on my future use of this package, on adoptions and request by others, I am willing to develop new features. The following list is my whishlist of features:

 - Passing additional props to components in a script tag inside component call
 - Maybe accepting also valid AST inside another script, for even more flexible control
 - Script tag before template containing code to run on compile time before constructing the AST
 - When content of a slot is a single tag, allow the option to specify the slot name as an attribute of that tag, without the need of enclosing it inside a fragment

Another brach of possibilities arise in including css and javascript for the browser. This could require defining a new extension and a language server for code editors. A completely analogous objective is already accomplished by [svelte](https://svelte.dev/), whose static rendering requires [SvelteKit](https://kit.svelte.dev/) though, which goes against my idea of simple straigh-forward static render out of the box with little to no setup, targetting small to medium projects.
Scoped css and scss support could be implemented via [PostCSS](https://postcss.org/). It would be awesome to include Typescript runtime code with easy links to declared DOM nodes (even though some care is needed in cases of conditionals and loops).