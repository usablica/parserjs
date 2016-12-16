# parser.js
Javascript AST parser

** Under development **

This is an attempt to extract the Parser service of Angluar.js and use it externally with other libararies
or even in Vanillajs.

## Example

```javascript
var equal = parserjs().parse('1 == 1');

console.log(equal()) // true;
```

## Authors

 - Angular.js 1.6 contributors for writing Parser
 - Afshin Mehrabani to extract the Parser service


## License

Please see the Angular.js license. This repository released under GPL v3.0.
