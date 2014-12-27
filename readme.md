# sig

high level reactive-style programming in javascript

```javascript
var vv = require('drainpipe'),
    sig = require('sig'),
    map = sig.map,
    put = sig.put,
    log = sig.log

var s = sig()

vv(s)
  (map, function(x) { return x + 1 })
  (filter, function(x) { return x % 2 })
  (then, log)

vv(s)
  (put, 1)  // 2
  (put, 2)
  (put, 3)  // 5
```

# docs

  - install
  - overview
  - api


## install

node:

```
$ npm install sig
```

browser:

```
$ bower install sig
```

```html
<script src="/bower_components/sig-js/sig.js"></script>
```

## overview

### sources and targets

### value propogation

### error propogation

### pausing and resuming

### deconstruction

### dependencies

### redirection

### sticky signals

## api

### `sig([values])`

Creates a new signal. If a `values` array is given, it is used as the initial values put through the signal.

```javascript
var s = sig([1, 2, 3])
```

### `put(s, v)`

Puts the value `v` through the signal `s`, where `v` can be a value of any type.

```javascript
var s = sig()
then(s, log)

put(s, 21)  // 21
put(s, 23)  // 23
```

### `raise(s, e)`

Propogates the error instance `e` through the signal `e`.

```javascript
var s = sig()
except(s, log)

raise(s, new Error('o_O'))  // o_O
```

### `reset(s)`

Resets the given signal.

```javascript
var s = sig()
then(s, log)

put(s, 21)  // 21
reset(s)

put(s, 23)
```

### `then(s, fn)`

Creates and returns a new signal with `fn` as its receiver function and `s` as its source signal. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()
var t = then(s, function(v) { put(this, v + 2) })
then(t, log)

put(s, 21)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()
var t = then(s, function(a, b, c) { put(this, a + b + c) }, 1, 2)
then(t, log)

put(s, 20)  // 23
```

### `then(s, t)`

Sets the signal `s` as the source of the signal `t` and returns `t`.  

```javascript
var s = sig()
var t = sig()
t.receiver = function(v) { return v }

then(s, t)
put(s, 23)  // 23
```

### `except(s, fn)`

Creates and returns a new signal with `fn` set as its error handling function and `s` as its source signal. `fn` is called with each raised error as its first argument and the created signal as its `this` context.

```javascript
var s = sig()
var t = except(s, log)

raise(s, new Error('o_O'))  // o_O
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()
var t = except(s, log)

raise(s, new Error('o_O'), '-_-', ':/')  // o_O -_- :/
```

### `map(s, fn)`

Creates and returns a new signal with a receiver function that calls `fn` and puts its return value through the signal. The created signal uses `s` as its source signal. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()
var t = map(s, function(v) { return v + 2 })
then(t, log)

put(s, 21)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()
var t = map(s, function(a, b, c) { put(this, a + b + c) }, 1, 2)
then(t, log)

put(s, 20)  // 23
```

### `filter(s, fn)`

Creates and returns a new signal with a receiver function that calls `fn` to determine whether to put each value recieved by the signal through the signal. The created signal uses `s` as its source signal. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()
var t = filter(s, function(v) { return v % 2 })
then(t, log)

put(s, 22)
put(s, 23)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()
var t = filter(s, function(a, b, c) { return (a + b + c) % 2 }, 1, 2)
then(t, log)

put(s, 22)  // 22
put(s, 23)
```

### `val([v])`

Creates and returns a new sticky signal. If `v` is given, it is used as the initial value for the created signal.

```javascript
var v = val(23)
then(v, log)  // 23
then(v, log)  // 23
```

### `ensure(v)`

If `v` is a signal, it is simply returned. Otherwise, a new signal is created with `v` as its initial value.

```javascript
var s = ensure(23)
then(v, log)  // 23
```

### `all(values)`

Accepts an array of `values`, where each value can be either a signal or non-signal, and returns a signal that outputs an array of the current values of each signal and non-signal each time one of the values changes. Note that the returned signal will only start outputting once each signal in the array has put through its first value.

```javascript
var s = sig()
var t = sig()
var u = all([s, 23, t])
then(u, log)

put(s, 1)
put(t, 3)  // [1, 23, 3]
put(s, 2)  // [2, 23, 3]
put(t, 1)  // [2, 23, 1]
put(s, 3)  // [3, 23, 1]
```

### `all(obj)`

Identical to `all(values)`, except it handles an object of key-value pairs instead of an array, where each value can be either a signal or non-signal.

```javascript
var s = sig()
var t = sig()
var u = all({
  a: s,
  b: 23,
  c: t
})
then(u, log)

put(s, 1)

put(t, 3)
// {
//   a: 1,
//   b: 23,
//   c: 3
// }

put(s, 2)
// {
//   a: 2,
//   b: 23,
//   c: 3
// }

put(t, 1)
// {
//   a: 2,
//   b: 23,
//   c: 1
// }

put(s, 3)
// {
//   a: 3,
//   b: 23,
//   c: 1
// }
```

### `any(values)`

Accepts an array of `values`, where each value can be either a signal or non-signal, and returns a signal that outputs an array containing the value and its corresponding signal's index in the array whenever one of the signals in the array changes.

```javascript
var s = sig()
var t = sig()
var u = any([s, 23, t])
then(u, spread, log)

put(s, 1)  // 1 0
put(t, 3)  // 3 2
put(s, 2)  // 2 0
put(t, 1)  // 1 2
put(s, 3)  // 3 0
```

### `any(obj)`

Identical to `any(values)`, except it handles an object of key-value pairs instead of an array, where each value can be either a signal or non-signal. The values outputted from the signal are arrays, each containing the given value and its corresponding signal's key in the object.

```javascript
var s = sig()
var t = sig()
var u = any({
  a: s,
  b: 23,
  c: t
})
then(u, spread, log)

put(s, 1)  // 1 a
put(t, 3)  // 3 c
put(s, 2)  // 2 a
put(t, 1)  // 1 c
put(s, 3)  // 3 a
```

### `limit(s, n)`

Creates and returns a new signal that only propogates the first `n` values it receives from signal `s`.

```javascript
var s = sig()
var t = limit(s, 3)
then(t, log)

put(s, 21)  // 21
put(s, 22)  // 22
put(s, 23)  // 23
put(s, 23)
put(s, 23)
```

### `once(s)`

Special case of `limit` where `n === 1`.

```javascript
var s = sig()
var t = once(s)
then(t, log)

put(s, 21)  // 21
put(s, 22)
put(s, 23)
```

### `redir(s, t)`

Redirects values and errors put through signal `s` to signal `t`. The returned signal is a new signal that controls this redirection. When either it, `s` or `t` is reset, the redirection ends. `redir` behaves differently to `then`, as it does not set `s` as the source of `t`.

```javascript
var s = sig()
var t = sig()
redir(s, t)

then(t, log)
put(s, 23)  // 23
```

### `source(t, s)`

Sets signal `s` as the source of signal `t` and returns `t`.

```javascript
var s = sig()
var t = sig()
then(t, log)

source(t, s)
put(s, 23)  // 23
```

### `unsource(t)`

Unsets the source signal of signal `t`.

```javascript
var s = sig()
var t = sig()
then(t, log)

source(t, s)
put(s, 21)  // 21

unsource(t)
put(s, 23)
```

### `depend(t, s)`

Sets signal `t` to depend on signal `s` and returns `t`.

```javascript
var s = sig()
var t = sig()
depend(t, s)

then(t, log)
put(t, 21)  // 21
reset(s)
put(t, 23)
```

### `undepend(t)`

Removes signal `t` as a dependency of signal `s` and returns `t`.

```javascript
var s = sig()
var t = sig()
depend(t, s)
undepend(t, s)

then(t, log)
put(t, 21)  // 21
reset(s)
put(t, 23)  // 23
```

### `receive(s, v)`

Gives the value `v` to the receiver function of signal `s`.

```javascript
var s = sig()
s.receiver = function(v) { console.log(v) }

receive(s, 23)  // 23
```

### `pause(s)`

Pauses signal `s`, causing any new values put through `s` to get buffered.

```javascript
var s = sig()
then(s, log)

put(s, 21)  // 21
pause(s)

put(s, 23)
resume(s)  // 23
```

### `resume(s)`

Resumes signal `s`, causing the buffered values to be sent to `s`'s targets and causing any new values to be sent to `s`'s targets.

```javascript
var s = sig()
then(s, log)

put(s, 21)  // 21
pause(s)

put(s, 23)
resume(s)  // 23
```

### `cleanup(s, fn)`

Schedules `fn` to be called when `s` is reset. `fn` is called with `s` as its `this` context.

```javascript
var s = sig()
var b = 2
cleanup(s, function() { b = null })

var t = map(s, function(a) { return a + b })
then(t, log)
put(s, 20)  // 23

reset(s)
log(b)  // null
```

### `spread(args, fn)`

Identical to `.apply`, except it accepts the array of arguments as its first argument, the function as its last argument, and the `this` context `spread` is called with as the function call's `this` context. Useful for cases where the values put through a source signal are arrays of values and the target signal expects the values as separate arguments.

```javascript
var s = sig()
then(s, spread, log)
put(s, [1, 2, 3])  // 1 2 3
```

### `to(v, s)`

Identical to `put`, except it takes the value as the first argument and the signal as the second argument. Helpful for situations where the value is calculated as the result of a chain of function calls.

```javascript
var s = sig()
then(s, log)

vv(23)
  (function(v) { return v * 2 })
  (function(v) { return v + 1 })
  (to, s)  // 47
```

### `putMany(s, values)`

Puts each value in a `values` array through the signal `s`.

```javascript
var s = sig()
then(s, log)

putMany(s, [1, 2, 3])
// 1
// 2
// 3
```

### `isSig(v)`

Returns `true` if `v` is a signal, `false` if it is not.

```javascript
isSig(23)  // => false
isSig(sig())  // => true
```

### `log([arg1[, arg2[, ...]]])`

Logs the given arguments. Identical to `console.log`, except it does not rely on `console` as its `this` context.
