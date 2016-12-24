import {
  createMap,
  forEach,
  getInputs,
  getStringValue,
  ifDefined,
  isString,
  isNumber,
  isFunction,
  isDefined,
  isConstant,
  lowercase,
  plusFn,
  copy
} from './utils';


'use strict';

var OPERATORS = createMap();
forEach('+ - * / % === !== == != < > <= >= && || ! = |'.split(' '), function(operator) { OPERATORS[operator] = true; });
var ESCAPE = {'n':'\n', 'f':'\f', 'r':'\r', 't':'\t', 'v':'\v', '\'':'\'', '"':'"'};

/////////////////////////////////////////

/**
 * @constructor
 */
var Lexer = function Lexer(options) {
  this.options = options;
};

Lexer.prototype = {
  constructor: Lexer,

  lex: function(text) {
    this.text = text;
    this.index = 0;
    this.tokens = [];

    while (this.index < this.text.length) {
      var ch = this.text.charAt(this.index);
      if (ch === '"' || ch === '\'') {
        this.readString(ch);
      } else if (this.isNumber(ch) || ch === '.' && this.isNumber(this.peek())) {
        this.readNumber();
      } else if (this.isIdentifierStart(this.peekMultichar())) {
        this.readIdent();
      } else if (this.is(ch, '(){}[].,;:?')) {
        this.tokens.push({index: this.index, text: ch});
        this.index++;
      } else if (this.isWhitespace(ch)) {
        this.index++;
      } else {
        var ch2 = ch + this.peek();
        var ch3 = ch2 + this.peek(2);
        var op1 = OPERATORS[ch];
        var op2 = OPERATORS[ch2];
        var op3 = OPERATORS[ch3];
        if (op1 || op2 || op3) {
          var token = op3 ? ch3 : (op2 ? ch2 : ch);
          this.tokens.push({index: this.index, text: token, operator: true});
          this.index += token.length;
        } else {
          this.throwError('Unexpected next character ', this.index, this.index + 1);
        }
      }
    }
    return this.tokens;
  },

  is: function(ch, chars) {
    return chars.indexOf(ch) !== -1;
  },

  peek: function(i) {
    var num = i || 1;
    return (this.index + num < this.text.length) ? this.text.charAt(this.index + num) : false;
  },

  isNumber: function(ch) {
    return ('0' <= ch && ch <= '9') && typeof ch === 'string';
  },

  isWhitespace: function(ch) {
    // IE treats non-breaking space as \u00A0
    return (ch === ' ' || ch === '\r' || ch === '\t' ||
            ch === '\n' || ch === '\v' || ch === '\u00A0');
  },

  isIdentifierStart: function(ch) {
    return this.options.isIdentifierStart ?
        this.options.isIdentifierStart(ch, this.codePointAt(ch)) :
        this.isValidIdentifierStart(ch);
  },

  isValidIdentifierStart: function(ch) {
    return ('a' <= ch && ch <= 'z' ||
            'A' <= ch && ch <= 'Z' ||
            '_' === ch || ch === '$');
  },

  isIdentifierContinue: function(ch) {
    return this.options.isIdentifierContinue ?
        this.options.isIdentifierContinue(ch, this.codePointAt(ch)) :
        this.isValidIdentifierContinue(ch);
  },

  isValidIdentifierContinue: function(ch, cp) {
    return this.isValidIdentifierStart(ch, cp) || this.isNumber(ch);
  },

  codePointAt: function(ch) {
    if (ch.length === 1) return ch.charCodeAt(0);
    // eslint-disable-next-line no-bitwise
    return (ch.charCodeAt(0) << 10) + ch.charCodeAt(1) - 0x35FDC00;
  },

  peekMultichar: function() {
    var ch = this.text.charAt(this.index);
    var peek = this.peek();
    if (!peek) {
      return ch;
    }
    var cp1 = ch.charCodeAt(0);
    var cp2 = peek.charCodeAt(0);
    if (cp1 >= 0xD800 && cp1 <= 0xDBFF && cp2 >= 0xDC00 && cp2 <= 0xDFFF) {
      return ch + peek;
    }
    return ch;
  },

  isExpOperator: function(ch) {
    return (ch === '-' || ch === '+' || this.isNumber(ch));
  },

  throwError: function(error, start, end) {
    end = end || this.index;
    var colStr = (isDefined(start)
            ? 's ' + start +  '-' + this.index + ' [' + this.text.substring(start, end) + ']'
            : ' ' + end);
    throw $parseMinErr('lexerr', 'Lexer Error: {0} at column{1} in expression [{2}].',
        error, colStr, this.text);
  },

  readNumber: function() {
    var number = '';
    var start = this.index;
    while (this.index < this.text.length) {
      var ch = lowercase(this.text.charAt(this.index));
      if (ch === '.' || this.isNumber(ch)) {
        number += ch;
      } else {
        var peekCh = this.peek();
        if (ch === 'e' && this.isExpOperator(peekCh)) {
          number += ch;
        } else if (this.isExpOperator(ch) &&
            peekCh && this.isNumber(peekCh) &&
            number.charAt(number.length - 1) === 'e') {
          number += ch;
        } else if (this.isExpOperator(ch) &&
            (!peekCh || !this.isNumber(peekCh)) &&
            number.charAt(number.length - 1) === 'e') {
          this.throwError('Invalid exponent');
        } else {
          break;
        }
      }
      this.index++;
    }
    this.tokens.push({
      index: start,
      text: number,
      constant: true,
      value: Number(number)
    });
  },

  readIdent: function() {
    var start = this.index;
    this.index += this.peekMultichar().length;
    while (this.index < this.text.length) {
      var ch = this.peekMultichar();
      if (!this.isIdentifierContinue(ch)) {
        break;
      }
      this.index += ch.length;
    }
    this.tokens.push({
      index: start,
      text: this.text.slice(start, this.index),
      identifier: true
    });
  },

  readString: function(quote) {
    var start = this.index;
    this.index++;
    var string = '';
    var rawString = quote;
    var escape = false;
    while (this.index < this.text.length) {
      var ch = this.text.charAt(this.index);
      rawString += ch;
      if (escape) {
        if (ch === 'u') {
          var hex = this.text.substring(this.index + 1, this.index + 5);
          if (!hex.match(/[\da-f]{4}/i)) {
            this.throwError('Invalid unicode escape [\\u' + hex + ']');
          }
          this.index += 4;
          string += String.fromCharCode(parseInt(hex, 16));
        } else {
          var rep = ESCAPE[ch];
          string = string + (rep || ch);
        }
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === quote) {
        this.index++;
        this.tokens.push({
          index: start,
          text: rawString,
          constant: true,
          value: string
        });
        return;
      } else {
        string += ch;
      }
      this.index++;
    }
    this.throwError('Unterminated quote', start);
  }
};

var AST = function AST(lexer, options) {
  this.lexer = lexer;
  this.options = options;
};

AST.Program = 'Program';
AST.ExpressionStatement = 'ExpressionStatement';
AST.AssignmentExpression = 'AssignmentExpression';
AST.ConditionalExpression = 'ConditionalExpression';
AST.LogicalExpression = 'LogicalExpression';
AST.BinaryExpression = 'BinaryExpression';
AST.UnaryExpression = 'UnaryExpression';
AST.CallExpression = 'CallExpression';
AST.MemberExpression = 'MemberExpression';
AST.Identifier = 'Identifier';
AST.Literal = 'Literal';
AST.ArrayExpression = 'ArrayExpression';
AST.Property = 'Property';
AST.ObjectExpression = 'ObjectExpression';
AST.ThisExpression = 'ThisExpression';
AST.LocalsExpression = 'LocalsExpression';

// Internal use only
AST.NGValueParameter = 'NGValueParameter';

AST.prototype = {
  ast: function(text) {
    this.text = text;
    this.tokens = this.lexer.lex(text);

    var value = this.program();

    if (this.tokens.length !== 0) {
      this.throwError('is an unexpected token', this.tokens[0]);
    }

    return value;
  },

  program: function() {
    var body = [];
    while (true) {
      if (this.tokens.length > 0 && !this.peek('}', ')', ';', ']'))
        body.push(this.expressionStatement());
      if (!this.expect(';')) {
        return { type: AST.Program, body: body};
      }
    }
  },

  expressionStatement: function() {
    return { type: AST.ExpressionStatement, expression: this.filterChain() };
  },

  filterChain: function() {
    var left = this.expression();
    while (this.expect('|')) {
      left = this.filter(left);
    }
    return left;
  },

  expression: function() {
    return this.assignment();
  },

  assignment: function() {
    var result = this.ternary();
    if (this.expect('=')) {
      if (!isAssignable(result)) {
        throw $parseMinErr('lval', 'Trying to assign a value to a non l-value');
      }

      result = { type: AST.AssignmentExpression, left: result, right: this.assignment(), operator: '='};
    }
    return result;
  },

  ternary: function() {
    var test = this.logicalOR();
    var alternate;
    var consequent;
    if (this.expect('?')) {
      alternate = this.expression();
      if (this.consume(':')) {
        consequent = this.expression();
        return { type: AST.ConditionalExpression, test: test, alternate: alternate, consequent: consequent};
      }
    }
    return test;
  },

  logicalOR: function() {
    var left = this.logicalAND();
    while (this.expect('||')) {
      left = { type: AST.LogicalExpression, operator: '||', left: left, right: this.logicalAND() };
    }
    return left;
  },

  logicalAND: function() {
    var left = this.equality();
    while (this.expect('&&')) {
      left = { type: AST.LogicalExpression, operator: '&&', left: left, right: this.equality()};
    }
    return left;
  },

  equality: function() {
    var left = this.relational();
    var token;
    while ((token = this.expect('==','!=','===','!=='))) {
      left = { type: AST.BinaryExpression, operator: token.text, left: left, right: this.relational() };
    }
    return left;
  },

  relational: function() {
    var left = this.additive();
    var token;
    while ((token = this.expect('<', '>', '<=', '>='))) {
      left = { type: AST.BinaryExpression, operator: token.text, left: left, right: this.additive() };
    }
    return left;
  },

  additive: function() {
    var left = this.multiplicative();
    var token;
    while ((token = this.expect('+','-'))) {
      left = { type: AST.BinaryExpression, operator: token.text, left: left, right: this.multiplicative() };
    }
    return left;
  },

  multiplicative: function() {
    var left = this.unary();
    var token;
    while ((token = this.expect('*','/','%'))) {
      left = { type: AST.BinaryExpression, operator: token.text, left: left, right: this.unary() };
    }
    return left;
  },

  unary: function() {
    var token;
    if ((token = this.expect('+', '-', '!'))) {
      return { type: AST.UnaryExpression, operator: token.text, prefix: true, argument: this.unary() };
    } else {
      return this.primary();
    }
  },

  primary: function() {
    var primary;
    if (this.expect('(')) {
      primary = this.filterChain();
      this.consume(')');
    } else if (this.expect('[')) {
      primary = this.arrayDeclaration();
    } else if (this.expect('{')) {
      primary = this.object();
    } else if (this.selfReferential.hasOwnProperty(this.peek().text)) {
      primary = copy(this.selfReferential[this.consume().text]);
    } else if (this.options.literals.hasOwnProperty(this.peek().text)) {
      primary = { type: AST.Literal, value: this.options.literals[this.consume().text]};
    } else if (this.peek().identifier) {
      primary = this.identifier();
    } else if (this.peek().constant) {
      primary = this.constant();
    } else {
      this.throwError('not a primary expression', this.peek());
    }

    var next;
    while ((next = this.expect('(', '[', '.'))) {
      if (next.text === '(') {
        primary = {type: AST.CallExpression, callee: primary, arguments: this.parseArguments() };
        this.consume(')');
      } else if (next.text === '[') {
        primary = { type: AST.MemberExpression, object: primary, property: this.expression(), computed: true };
        this.consume(']');
      } else if (next.text === '.') {
        primary = { type: AST.MemberExpression, object: primary, property: this.identifier(), computed: false };
      } else {
        this.throwError('IMPOSSIBLE');
      }
    }
    return primary;
  },

  filter: function(baseExpression) {
    var args = [baseExpression];
    var result = {type: AST.CallExpression, callee: this.identifier(), arguments: args, filter: true};

    while (this.expect(':')) {
      args.push(this.expression());
    }

    return result;
  },

  parseArguments: function() {
    var args = [];
    if (this.peekToken().text !== ')') {
      do {
        args.push(this.filterChain());
      } while (this.expect(','));
    }
    return args;
  },

  identifier: function() {
    var token = this.consume();
    if (!token.identifier) {
      this.throwError('is not a valid identifier', token);
    }
    return { type: AST.Identifier, name: token.text };
  },

  constant: function() {
    // TODO check that it is a constant
    return { type: AST.Literal, value: this.consume().value };
  },

  arrayDeclaration: function() {
    var elements = [];
    if (this.peekToken().text !== ']') {
      do {
        if (this.peek(']')) {
          // Support trailing commas per ES5.1.
          break;
        }
        elements.push(this.expression());
      } while (this.expect(','));
    }
    this.consume(']');

    return { type: AST.ArrayExpression, elements: elements };
  },

  object: function() {
    var properties = [], property;
    if (this.peekToken().text !== '}') {
      do {
        if (this.peek('}')) {
          // Support trailing commas per ES5.1.
          break;
        }
        property = {type: AST.Property, kind: 'init'};
        if (this.peek().constant) {
          property.key = this.constant();
          property.computed = false;
          this.consume(':');
          property.value = this.expression();
        } else if (this.peek().identifier) {
          property.key = this.identifier();
          property.computed = false;
          if (this.peek(':')) {
            this.consume(':');
            property.value = this.expression();
          } else {
            property.value = property.key;
          }
        } else if (this.peek('[')) {
          this.consume('[');
          property.key = this.expression();
          this.consume(']');
          property.computed = true;
          this.consume(':');
          property.value = this.expression();
        } else {
          this.throwError('invalid key', this.peek());
        }
        properties.push(property);
      } while (this.expect(','));
    }
    this.consume('}');

    return {type: AST.ObjectExpression, properties: properties };
  },

  throwError: function(msg, token) {
    throw $parseMinErr('syntax',
        'Syntax Error: Token \'{0}\' {1} at column {2} of the expression [{3}] starting at [{4}].',
          token.text, msg, (token.index + 1), this.text, this.text.substring(token.index));
  },

  consume: function(e1) {
    if (this.tokens.length === 0) {
      throw $parseMinErr('ueoe', 'Unexpected end of expression: {0}', this.text);
    }

    var token = this.expect(e1);
    if (!token) {
      this.throwError('is unexpected, expecting [' + e1 + ']', this.peek());
    }
    return token;
  },

  peekToken: function() {
    if (this.tokens.length === 0) {
      throw $parseMinErr('ueoe', 'Unexpected end of expression: {0}', this.text);
    }
    return this.tokens[0];
  },

  peek: function(e1, e2, e3, e4) {
    return this.peekAhead(0, e1, e2, e3, e4);
  },

  peekAhead: function(i, e1, e2, e3, e4) {
    if (this.tokens.length > i) {
      var token = this.tokens[i];
      var t = token.text;
      if (t === e1 || t === e2 || t === e3 || t === e4 ||
          (!e1 && !e2 && !e3 && !e4)) {
        return token;
      }
    }
    return false;
  },

  expect: function(e1, e2, e3, e4) {
    var token = this.peek(e1, e2, e3, e4);
    if (token) {
      this.tokens.shift();
      return token;
    }
    return false;
  },

  selfReferential: {
    'this': {type: AST.ThisExpression },
    '$locals': {type: AST.LocalsExpression }
  }
};

function isAssignable (ast) {
  return ast.type === AST.Identifier || ast.type === AST.MemberExpression;
}

function assignableAST(ast) {
  if (ast.body.length === 1 && isAssignable(ast.body[0].expression)) {
    return {type: AST.AssignmentExpression, left: ast.body[0].expression, right: {type: AST.NGValueParameter}, operator: '='};
  }
}

function isLiteral(ast) {
  return ast.body.length === 0 ||
      ast.body.length === 1 && (
      ast.body[0].expression.type === AST.Literal ||
      ast.body[0].expression.type === AST.ArrayExpression ||
      ast.body[0].expression.type === AST.ObjectExpression);
}

function findConstantAndWatchExpressions(ast, $filter) {
  var allConstants;
  var argsToWatch;
  var isStatelessFilter;
  switch (ast.type) {
  case AST.Program:
    allConstants = true;
    forEach(ast.body, function(expr) {
      findConstantAndWatchExpressions(expr.expression, $filter);
      allConstants = allConstants && expr.expression.constant;
    });
    ast.constant = allConstants;
    break;
  case AST.Literal:
    ast.constant = true;
    ast.toWatch = [];
    break;
  case AST.UnaryExpression:
    findConstantAndWatchExpressions(ast.argument, $filter);
    ast.constant = ast.argument.constant;
    ast.toWatch = ast.argument.toWatch;
    break;
  case AST.BinaryExpression:
    findConstantAndWatchExpressions(ast.left, $filter);
    findConstantAndWatchExpressions(ast.right, $filter);
    ast.constant = ast.left.constant && ast.right.constant;
    ast.toWatch = ast.left.toWatch.concat(ast.right.toWatch);
    break;
  case AST.LogicalExpression:
    findConstantAndWatchExpressions(ast.left, $filter);
    findConstantAndWatchExpressions(ast.right, $filter);
    ast.constant = ast.left.constant && ast.right.constant;
    ast.toWatch = ast.constant ? [] : [ast];
    break;
  case AST.ConditionalExpression:
    findConstantAndWatchExpressions(ast.test, $filter);
    findConstantAndWatchExpressions(ast.alternate, $filter);
    findConstantAndWatchExpressions(ast.consequent, $filter);
    ast.constant = ast.test.constant && ast.alternate.constant && ast.consequent.constant;
    ast.toWatch = ast.constant ? [] : [ast];
    break;
  case AST.Identifier:
    ast.constant = false;
    ast.toWatch = [ast];
    break;
  case AST.MemberExpression:
    findConstantAndWatchExpressions(ast.object, $filter);
    if (ast.computed) {
      findConstantAndWatchExpressions(ast.property, $filter);
    }
    ast.constant = ast.object.constant && (!ast.computed || ast.property.constant);
    ast.toWatch = [ast];
    break;
  case AST.CallExpression:
    isStatelessFilter = ast.filter ? isStateless($filter, ast.callee.name) : false;
    allConstants = isStatelessFilter;
    argsToWatch = [];
    forEach(ast.arguments, function(expr) {
      findConstantAndWatchExpressions(expr, $filter);
      allConstants = allConstants && expr.constant;
      if (!expr.constant) {
        argsToWatch.push.apply(argsToWatch, expr.toWatch);
      }
    });
    ast.constant = allConstants;
    ast.toWatch = isStatelessFilter ? argsToWatch : [ast];
    break;
  case AST.AssignmentExpression:
    findConstantAndWatchExpressions(ast.left, $filter);
    findConstantAndWatchExpressions(ast.right, $filter);
    ast.constant = ast.left.constant && ast.right.constant;
    ast.toWatch = [ast];
    break;
  case AST.ArrayExpression:
    allConstants = true;
    argsToWatch = [];
    forEach(ast.elements, function(expr) {
      findConstantAndWatchExpressions(expr, $filter);
      allConstants = allConstants && expr.constant;
      if (!expr.constant) {
        argsToWatch.push.apply(argsToWatch, expr.toWatch);
      }
    });
    ast.constant = allConstants;
    ast.toWatch = argsToWatch;
    break;
  case AST.ObjectExpression:
    allConstants = true;
    argsToWatch = [];
    forEach(ast.properties, function(property) {
      findConstantAndWatchExpressions(property.value, $filter);
      allConstants = allConstants && property.value.constant && !property.computed;
      if (!property.value.constant) {
        argsToWatch.push.apply(argsToWatch, property.value.toWatch);
      }
    });
    ast.constant = allConstants;
    ast.toWatch = argsToWatch;
    break;
  case AST.ThisExpression:
    ast.constant = false;
    ast.toWatch = [];
    break;
  case AST.LocalsExpression:
    ast.constant = false;
    ast.toWatch = [];
    break;
  }
}

function ASTCompiler(astBuilder, $filter) {
  this.astBuilder = astBuilder;
  this.$filter = $filter;
}

ASTCompiler.prototype = {
  compile: function(expression) {
    var self = this;
    var ast = this.astBuilder.ast(expression);
    this.state = {
      nextId: 0,
      filters: {},
      fn: {vars: [], body: [], own: {}},
      assign: {vars: [], body: [], own: {}},
      inputs: []
    };
    findConstantAndWatchExpressions(ast, self.$filter);
    var extra = '';
    var assignable;
    this.stage = 'assign';
    if ((assignable = assignableAST(ast))) {
      this.state.computing = 'assign';
      var result = this.nextId();
      this.recurse(assignable, result);
      this.return_(result);
      extra = 'fn.assign=' + this.generateFunction('assign', 's,v,l');
    }
    var toWatch = getInputs(ast.body);
    self.stage = 'inputs';
    forEach(toWatch, function(watch, key) {
      var fnKey = 'fn' + key;
      self.state[fnKey] = {vars: [], body: [], own: {}};
      self.state.computing = fnKey;
      var intoId = self.nextId();
      self.recurse(watch, intoId);
      self.return_(intoId);
      self.state.inputs.push(fnKey);
      watch.watchId = key;
    });
    this.state.computing = 'fn';
    this.stage = 'main';
    this.recurse(ast);
    var fnString =
      // The build and minification steps remove the string "use strict" from the code, but this is done using a regex.
      // This is a workaround for this until we do a better job at only removing the prefix only when we should.
      '"' + this.USE + ' ' + this.STRICT + '";\n' +
      this.filterPrefix() +
      'var fn=' + this.generateFunction('fn', 's,l,a,i') +
      extra +
      this.watchFns() +
      'return fn;';

    // eslint-disable-next-line no-new-func
    var fn = (new Function('$filter',
        'getStringValue',
        'ifDefined',
        'plus',
        fnString))(
          this.$filter,
          getStringValue,
          ifDefined,
          plusFn);
    this.state = this.stage = undefined;
    fn.literal = isLiteral(ast);
    fn.constant = isConstant(ast);
    return fn;
  },

  USE: 'use',

  STRICT: 'strict',

  watchFns: function() {
    var result = [];
    var fns = this.state.inputs;
    var self = this;
    forEach(fns, function(name) {
      result.push('var ' + name + '=' + self.generateFunction(name, 's'));
    });
    if (fns.length) {
      result.push('fn.inputs=[' + fns.join(',') + '];');
    }
    return result.join('');
  },

  generateFunction: function(name, params) {
    return 'function(' + params + '){' +
        this.varsPrefix(name) +
        this.body(name) +
        '};';
  },

  filterPrefix: function() {
    var parts = [];
    var self = this;
    forEach(this.state.filters, function(id, filter) {
      parts.push(id + '=$filter(' + self.escape(filter) + ')');
    });
    if (parts.length) return 'var ' + parts.join(',') + ';';
    return '';
  },

  varsPrefix: function(section) {
    return this.state[section].vars.length ? 'var ' + this.state[section].vars.join(',') + ';' : '';
  },

  body: function(section) {
    return this.state[section].body.join('');
  },

  recurse: function(ast, intoId, nameId, recursionFn, create, skipWatchIdCheck) {
    var left, right, self = this, args, expression, computed;
    recursionFn = recursionFn || noop;
    if (!skipWatchIdCheck && isDefined(ast.watchId)) {
      intoId = intoId || this.nextId();
      this.if_('i',
        this.lazyAssign(intoId, this.computedMember('i', ast.watchId)),
        this.lazyRecurse(ast, intoId, nameId, recursionFn, create, true)
      );
      return;
    }
    switch (ast.type) {
    case AST.Program:
      forEach(ast.body, function(expression, pos) {
        self.recurse(expression.expression, undefined, undefined, function(expr) { right = expr; });
        if (pos !== ast.body.length - 1) {
          self.current().body.push(right, ';');
        } else {
          self.return_(right);
        }
      });
      break;
    case AST.Literal:
      expression = this.escape(ast.value);
      this.assign(intoId, expression);
      recursionFn(intoId || expression);
      break;
    case AST.UnaryExpression:
      this.recurse(ast.argument, undefined, undefined, function(expr) { right = expr; });
      expression = ast.operator + '(' + this.ifDefined(right, 0) + ')';
      this.assign(intoId, expression);
      recursionFn(expression);
      break;
    case AST.BinaryExpression:
      this.recurse(ast.left, undefined, undefined, function(expr) { left = expr; });
      this.recurse(ast.right, undefined, undefined, function(expr) { right = expr; });
      if (ast.operator === '+') {
        expression = this.plus(left, right);
      } else if (ast.operator === '-') {
        expression = this.ifDefined(left, 0) + ast.operator + this.ifDefined(right, 0);
      } else {
        expression = '(' + left + ')' + ast.operator + '(' + right + ')';
      }
      this.assign(intoId, expression);
      recursionFn(expression);
      break;
    case AST.LogicalExpression:
      intoId = intoId || this.nextId();
      self.recurse(ast.left, intoId);
      self.if_(ast.operator === '&&' ? intoId : self.not(intoId), self.lazyRecurse(ast.right, intoId));
      recursionFn(intoId);
      break;
    case AST.ConditionalExpression:
      intoId = intoId || this.nextId();
      self.recurse(ast.test, intoId);
      self.if_(intoId, self.lazyRecurse(ast.alternate, intoId), self.lazyRecurse(ast.consequent, intoId));
      recursionFn(intoId);
      break;
    case AST.Identifier:
      intoId = intoId || this.nextId();
      if (nameId) {
        nameId.context = self.stage === 'inputs' ? 's' : this.assign(this.nextId(), this.getHasOwnProperty('l', ast.name) + '?l:s');
        nameId.computed = false;
        nameId.name = ast.name;
      }
      self.if_(self.stage === 'inputs' || self.not(self.getHasOwnProperty('l', ast.name)),
        function() {
          self.if_(self.stage === 'inputs' || 's', function() {
            if (create && create !== 1) {
              self.if_(
                self.isNull(self.nonComputedMember('s', ast.name)),
                self.lazyAssign(self.nonComputedMember('s', ast.name), '{}'));
            }
            self.assign(intoId, self.nonComputedMember('s', ast.name));
          });
        }, intoId && self.lazyAssign(intoId, self.nonComputedMember('l', ast.name))
        );
      recursionFn(intoId);
      break;
    case AST.MemberExpression:
      left = nameId && (nameId.context = this.nextId()) || this.nextId();
      intoId = intoId || this.nextId();
      self.recurse(ast.object, left, undefined, function() {
        self.if_(self.notNull(left), function() {
          if (ast.computed) {
            right = self.nextId();
            self.recurse(ast.property, right);
            self.getStringValue(right);
            if (create && create !== 1) {
              self.if_(self.not(self.computedMember(left, right)), self.lazyAssign(self.computedMember(left, right), '{}'));
            }
            expression = self.computedMember(left, right);
            self.assign(intoId, expression);
            if (nameId) {
              nameId.computed = true;
              nameId.name = right;
            }
          } else {
            if (create && create !== 1) {
              self.if_(self.isNull(self.nonComputedMember(left, ast.property.name)), self.lazyAssign(self.nonComputedMember(left, ast.property.name), '{}'));
            }
            expression = self.nonComputedMember(left, ast.property.name);
            self.assign(intoId, expression);
            if (nameId) {
              nameId.computed = false;
              nameId.name = ast.property.name;
            }
          }
        }, function() {
          self.assign(intoId, 'undefined');
        });
        recursionFn(intoId);
      }, !!create);
      break;
    case AST.CallExpression:
      intoId = intoId || this.nextId();
      if (ast.filter) {
        right = self.filter(ast.callee.name);
        args = [];
        forEach(ast.arguments, function(expr) {
          var argument = self.nextId();
          self.recurse(expr, argument);
          args.push(argument);
        });
        expression = right + '(' + args.join(',') + ')';
        self.assign(intoId, expression);
        recursionFn(intoId);
      } else {
        right = self.nextId();
        left = {};
        args = [];
        self.recurse(ast.callee, right, left, function() {
          self.if_(self.notNull(right), function() {
            forEach(ast.arguments, function(expr) {
              self.recurse(expr, ast.constant ? undefined : self.nextId(), undefined, function(argument) {
                args.push(argument);
              });
            });
            if (left.name) {
              expression = self.member(left.context, left.name, left.computed) + '(' + args.join(',') + ')';
            } else {
              expression = right + '(' + args.join(',') + ')';
            }
            self.assign(intoId, expression);
          }, function() {
            self.assign(intoId, 'undefined');
          });
          recursionFn(intoId);
        });
      }
      break;
    case AST.AssignmentExpression:
      right = this.nextId();
      left = {};
      this.recurse(ast.left, undefined, left, function() {
        self.if_(self.notNull(left.context), function() {
          self.recurse(ast.right, right);
          expression = self.member(left.context, left.name, left.computed) + ast.operator + right;
          self.assign(intoId, expression);
          recursionFn(intoId || expression);
        });
      }, 1);
      break;
    case AST.ArrayExpression:
      args = [];
      forEach(ast.elements, function(expr) {
        self.recurse(expr, ast.constant ? undefined : self.nextId(), undefined, function(argument) {
          args.push(argument);
        });
      });
      expression = '[' + args.join(',') + ']';
      this.assign(intoId, expression);
      recursionFn(intoId || expression);
      break;
    case AST.ObjectExpression:
      args = [];
      computed = false;
      forEach(ast.properties, function(property) {
        if (property.computed) {
          computed = true;
        }
      });
      if (computed) {
        intoId = intoId || this.nextId();
        this.assign(intoId, '{}');
        forEach(ast.properties, function(property) {
          if (property.computed) {
            left = self.nextId();
            self.recurse(property.key, left);
          } else {
            left = property.key.type === AST.Identifier ?
                       property.key.name :
                       ('' + property.key.value);
          }
          right = self.nextId();
          self.recurse(property.value, right);
          self.assign(self.member(intoId, left, property.computed), right);
        });
      } else {
        forEach(ast.properties, function(property) {
          self.recurse(property.value, ast.constant ? undefined : self.nextId(), undefined, function(expr) {
            args.push(self.escape(
                property.key.type === AST.Identifier ? property.key.name :
                  ('' + property.key.value)) +
                ':' + expr);
          });
        });
        expression = '{' + args.join(',') + '}';
        this.assign(intoId, expression);
      }
      recursionFn(intoId || expression);
      break;
    case AST.ThisExpression:
      this.assign(intoId, 's');
      recursionFn(intoId || 's');
      break;
    case AST.LocalsExpression:
      this.assign(intoId, 'l');
      recursionFn(intoId || 'l');
      break;
    case AST.NGValueParameter:
      this.assign(intoId, 'v');
      recursionFn(intoId || 'v');
      break;
    }
  },

  getHasOwnProperty: function(element, property) {
    var key = element + '.' + property;
    var own = this.current().own;
    if (!own.hasOwnProperty(key)) {
      own[key] = this.nextId(false, element + '&&(' + this.escape(property) + ' in ' + element + ')');
    }
    return own[key];
  },

  assign: function(id, value) {
    if (!id) return;
    this.current().body.push(id, '=', value, ';');
    return id;
  },

  filter: function(filterName) {
    if (!this.state.filters.hasOwnProperty(filterName)) {
      this.state.filters[filterName] = this.nextId(true);
    }
    return this.state.filters[filterName];
  },

  ifDefined: function(id, defaultValue) {
    return 'ifDefined(' + id + ',' + this.escape(defaultValue) + ')';
  },

  plus: function(left, right) {
    return 'plus(' + left + ',' + right + ')';
  },

  return_: function(id) {
    this.current().body.push('return ', id, ';');
  },

  if_: function(test, alternate, consequent) {
    if (test === true) {
      alternate();
    } else {
      var body = this.current().body;
      body.push('if(', test, '){');
      alternate();
      body.push('}');
      if (consequent) {
        body.push('else{');
        consequent();
        body.push('}');
      }
    }
  },

  not: function(expression) {
    return '!(' + expression + ')';
  },

  isNull: function(expression) {
    return expression + '==null';
  },

  notNull: function(expression) {
    return expression + '!=null';
  },

  nonComputedMember: function(left, right) {
    var SAFE_IDENTIFIER = /^[$_a-zA-Z][$_a-zA-Z0-9]*$/;
    var UNSAFE_CHARACTERS = /[^$_a-zA-Z0-9]/g;
    if (SAFE_IDENTIFIER.test(right)) {
      return left + '.' + right;
    } else {
      return left  + '["' + right.replace(UNSAFE_CHARACTERS, this.stringEscapeFn) + '"]';
    }
  },

  computedMember: function(left, right) {
    return left + '[' + right + ']';
  },

  member: function(left, right, computed) {
    if (computed) return this.computedMember(left, right);
    return this.nonComputedMember(left, right);
  },

  getStringValue: function(item) {
    this.assign(item, 'getStringValue(' + item + ')');
  },

  lazyRecurse: function(ast, intoId, nameId, recursionFn, create, skipWatchIdCheck) {
    var self = this;
    return function() {
      self.recurse(ast, intoId, nameId, recursionFn, create, skipWatchIdCheck);
    };
  },

  lazyAssign: function(id, value) {
    var self = this;
    return function() {
      self.assign(id, value);
    };
  },

  stringEscapeRegex: /[^ a-zA-Z0-9]/g,

  stringEscapeFn: function(c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  },

  escape: function(value) {
    if (isString(value)) return '\'' + value.replace(this.stringEscapeRegex, this.stringEscapeFn) + '\'';
    if (isNumber(value)) return value.toString();
    if (value === true) return 'true';
    if (value === false) return 'false';
    if (value === null) return 'null';
    if (typeof value === 'undefined') return 'undefined';

    throw $parseMinErr('esc', 'IMPOSSIBLE');
  },

  nextId: function(skip, init) {
    var id = 'v' + (this.state.nextId++);
    if (!skip) {
      this.current().vars.push(id + (init ? '=' + init : ''));
    }
    return id;
  },

  current: function() {
    return this.state[this.state.computing];
  }
};

/**
 * @constructor
 */
var Parser = function Parser(lexer, $filter, options) {
  this.lexer = lexer;
  this.$filter = $filter;
  this.options = options;
  this.ast = new AST(lexer, options);
  // I have removed the ASTInterpreter
  // Is this necessary to have both in this context?
  this.astCompiler = new ASTCompiler(this.ast, $filter);
};

Parser.prototype = {
  constructor: Parser,

  parse: function(text) {
    return this.astCompiler.compile(text);
  }
};

var literals = {
  'true': true,
  'false': false,
  'null': null,
  'undefined': undefined
};

function noop() {}
noop.$inject = [];

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['exports'], factory);
    } else if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
        // CommonJS
        factory(exports);
    } else {
        // Browser globals
        factory((root.commonJsStrict = {}));
    }
}(this, function (exports) {
  var $parseOptions = {
    literals: copy(literals)
  };

  var lexer   = new Lexer($parseOptions);
  var context = {};
  var parser  = new Parser(lexer, context, $parseOptions);

  exports.parserjs = {
    'parse': parser.parse.bind(parser)
  };
}));
