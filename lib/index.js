'use strict';

// allowed globals in Vue render functions.
// TODO add option to customize
const GLOBALS_IN_TEMPLATE = ["BigInt", "Infinity", "undefined", "NaN", "isFinite", "isNaN", "parseFloat", "parseInt", "decodeURI", "decodeURIComponent", "encodeURI", "encodeURIComponent", "Math", "Number", "Date", "Array", "Object", "Boolean", "String", "RegExp", "Map", "Set", "JSON", "Intl", "require", "arguments", "_vm", "_h", "_c"];
const hash = Object.create(null);
GLOBALS_IN_TEMPLATE.forEach(name => {
  hash[name] = true;
});

/*
Interpret Bubble's logic:
https://github.com/yyx990803/buble/blob/f5996c9cdb2e61cb7dddf0f6c6f25d0f3f600055/src/utils/prependVm.js
*/

const t$1 = require('@babel/types');

function inScope(scope, nodeName) {
  if (!scope || !scope.bindings) return false;
  let ret = false;
  let cur = scope;

  while (cur) {
    ret = cur.bindings[nodeName];

    if (cur === scope.parent || ret) {
      break;
    }

    cur = scope.parent;
  }

  return ret;
}

function shouldPrependVmNew(path) {
  var _scope$path, _scope$block$params;

  const parent = path.parent;
  const node = path.node;
  const nodeName = node.name;
  const scope = path.scope;

  if ( // not function parameter destructuring
  ((_scope$path = scope.path) === null || _scope$path === void 0 ? void 0 : _scope$path.listKey) !== 'params' // not a id of a Declaration:
  && !(t$1.isVariableDeclarator(parent) && parent.id === node) // not a param of a function
  && !(t$1.isFunctionExpression(parent) && parent.params.indexOf(node) > -1) // not a property of OptionalMemberExpression
  && !(t$1.isOptionalMemberExpression(parent) && parent.property === node) // not a key of Property
  && !(t$1.isObjectProperty(parent) && parent.key === node) // not a property of a MemberExpression
  && !(t$1.isMemberExpression(parent) && parent.property === node && !parent.computed) // not in an Array destructure pattern
  && !t$1.isArrayPattern(parent) // not in an Object destructure pattern
  && !t$1.isObjectPattern(parent.parent) // skip globals + commonly used shorthands
  && !hash[nodeName] // not cur function param
  && !(scope !== null && scope !== void 0 && (_scope$block$params = scope.block.params) !== null && _scope$block$params !== void 0 && _scope$block$params.find(node => node.name === nodeName)) // not already in scope
  && !inScope(scope, nodeName)) {
    return true;
  }
}

const vueModelName = '_vm';
const WithStatementReplaceComment = '__VUE_TEMPLATE_BABEL_COMPILER_WITH_PLACEHOLDER__';

const t = require('@babel/types');

const nestedVisitor = {
  Identifier(path) {
    if (shouldPrependVmNew(path)) {
      path.replaceWith(t.memberExpression(t.identifier(vueModelName), path.node));
    }
  }

};
function parseWithStatementToVm() {
  return {
    visitor: {
      WithStatement(path) {
        // only traverse children ast of `with(this) {...}` part,
        // just like the `identifier.program.inWith` of bubble's logic
        path.traverse(nestedVisitor);
        const withStatementReturnBody = path.node.body.body[0];
        t.addComment(withStatementReturnBody, "leading", WithStatementReplaceComment);
        path.replaceWithMultiple([withStatementReturnBody]);
      }

    }
  };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const babel = require('@babel/core');

const matchWithRegex = new RegExp(escapeRegExp(`/*${WithStatementReplaceComment}*/`), 'g');
const withReplacement = 'var _vm=this;\n  var _h=_vm.$createElement;\n  var _c=_vm._self._c||_h;\n';
const functionalWithReplacement = 'var _c=_vm._c;\n';
function renderCompiler(code, options) {
  var _options$transforms;

  // TODO add customize individual options
  const isFunctional = options === null || options === void 0 ? void 0 : (_options$transforms = options.transforms) === null || _options$transforms === void 0 ? void 0 : _options$transforms.stripWithFunctional;
  const output = babel.transformSync(code, {
    filename: 'compiledTemplate',
    // not enable strict mode, in order to parse WithStatement
    sourceType: 'script',
    plugins: ['@babel/plugin-proposal-nullish-coalescing-operator', '@babel/plugin-proposal-optional-chaining', '@babel/plugin-transform-block-scoping', '@babel/plugin-transform-destructuring', "@babel/plugin-transform-spread", ["@babel/plugin-proposal-object-rest-spread", {
      loose: true,
      useBuiltIns: true
    }], '@babel/plugin-transform-arrow-functions', '@babel/plugin-transform-parameters', parseWithStatementToVm]
  });
  return output.code.replace(matchWithRegex, isFunctional ? functionalWithReplacement : withReplacement);
}

const templateCompiler = require('vue-template-compiler');

function toFunction(code, isFunctional) {
  return `function (${isFunctional ? `_h,_vm` : ``}) {${code}}`;
}

function getMarkRange(code, startMark, endMark) {
  if (!code || !code.indexOf) {
    // TODO handle edge error
    return false;
  }

  return {
    start: code.indexOf(startMark) + 1,
    end: code.lastIndexOf(endMark)
  };
}

function getFunctionBody(code) {
  const range = getMarkRange(code, '{', '}');
  return code.substring(range.start, range.end);
}

function getArrayItems(code) {
  const range = getMarkRange(code, '[', ']');
  return code.substring(range.start, range.end).split('function').filter(functionBodyStr => Boolean(functionBodyStr)).map(getFunctionBody);
}

const renderSeparator = '/* renderSeparator */';
function compileTemplate(source, options) {
  var _options$filename;

  const isFunctional = options === null || options === void 0 ? void 0 : (_options$filename = options.filename) === null || _options$filename === void 0 ? void 0 : _options$filename.includes((options === null || options === void 0 ? void 0 : options.functionalComponentFileIdentifier) || '.functional');
  const {
    ast,
    render,
    staticRenderFns,
    tips,
    errors
  } = templateCompiler.compile(source, options); // TODO rm semicolon && \n : https://babeljs.io/docs/en/options#minified

  let code = `var render = ${toFunction(render, isFunctional)}` + ';' + renderSeparator;
  const hasStaticRenders = staticRenderFns.length;

  if (hasStaticRenders) {
    code += `var staticRenderFns = [${staticRenderFns.map(render => toFunction(render, isFunctional))}]`;
  }

  const [compiledRender, compiledStaticRenders] = renderCompiler(code, {
    transforms: {
      stripWithFunctional: isFunctional
    }
  }).split(renderSeparator);
  return {
    ast,
    render: getFunctionBody(compiledRender),
    staticRenderFns: hasStaticRenders ? getArrayItems(compiledStaticRenders) : staticRenderFns,
    tips,
    errors
  };
}
function extendTemplateCompiler(obj) {
  for (const key in templateCompiler) {
    obj[key] = templateCompiler[key];
  }

  obj.ssrCompile = compileTemplate;
  obj.compile = compileTemplate;
}

const transpile = renderCompiler; // enhance vue-template-compiler with babel:

extendTemplateCompiler(transpile);
module.exports = transpile;
