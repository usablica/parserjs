var assert = require('assert');
var parserjs = require('../src/parser.js').parserjs;

describe('Compare', function() {
  describe('equal', function() {
    it('1 == 1', function() {
      assert.equal(true, parserjs.parse('1 == 1')());
    });

    it('true == true', function() {
      assert.equal(true, parserjs.parse('true == true')());
    });

    it('1.1 == 1.1', function() {
      assert.equal(true, parserjs.parse('1.1 == 1.1')());
    });

    it('"hi" == "hi"', function() {
      assert.equal(true, parserjs.parse('"hi" == "hi"')());
    });
  });
});
