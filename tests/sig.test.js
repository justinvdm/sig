const sig = require('..')
const test = require('ava')
const EventEmitter = require('events').EventEmitter

function capture(s) {
  const results = []

  s.each(function (v) {
    results.push(v)
  }).done()

  return results
}

function sink(s, fn) {
  const results = []
  fn = sig.prime(sig.slice(arguments, 2), fn)

  return s
    .each(function (v) {
      results.push(v)
    })
    .teardown(function () {
      fn(results)
    })
}

function captureErrors(s) {
  return s
    .catch(function (e) {
      this.put(e.message).next()
    })
    .call(capture)
}

function counter(s) {
  let i = 0

  s.each(function () {
    i++
  }).done()

  return function () {
    return i
  }
}

const _adapters_ = sig._adapters_

test.beforeEach(() => {
  sig._adapters_ = sig.slice(_adapters_)
})

test.after(() => {
  sig._adapters_ = _adapters_
})

// # sig
test('sig should allow values to be sent through signals', assert => {
  const src = sig()
  const results = []

  src
    .then(function (x) {
      if (x % 2) this.put(x)
      this.next()
    })
    .then(function (x) {
      this.put(x + 1).next()
    })
    .then(function (x) {
      results.push(x)
      this.next()
    })
    .done()

  assert.truthy(!results.length)

  src.put(1)
  assert.deepEqual(results, [2])

  src.put(2)
  assert.deepEqual(results, [2])

  src.put(3)
  assert.deepEqual(results, [2, 4])
})

test('sig should not allow multiple source signals', assert => {
  const t = sig()

  function addSource() {
    sig().then(t).done()
  }

  addSource()

  assert.throws(addSource, {
    message: /Cannot set signal's source, signal already has a source/
  })
})

test('sig should allow multiple target signals', assert => {
  const results1 = []
  const results2 = []
  const s = sig()
  const t1 = sig()
  const t2 = sig()

  t1.handlers.value = function (x) {
    results1.push(x)
    this.next()
  }

  t2.handlers.value = function (x) {
    results2.push(x)
    this.next()
  }

  s.then(t1).done()
  s.then(t2).done()

  s.putEach([1, 2, 3, 4])
  assert.deepEqual(results1, [1, 2, 3, 4])
  assert.deepEqual(results2, [1, 2, 3, 4])
})

test('sig should support creating a signal from no arguments', assert => {
  assert.truthy(sig.isSig(sig()))
})

test('sig should support creating a signal from a value handling fn', assert => {
  const s = sig([21, 22, 23])
  const t = s.then(sig(fn, 1, 2))
  assert.deepEqual(capture(t), [24, 25, 26])

  function fn(a, b, c) {
    this.put(a + b + c).next()
  }
})

test('sig should act as an identity function for existing signals', assert => {
  const s = sig()
  assert.is(s, sig(s))
})

test('sig should allow initial values to be given', assert => {
  assert.deepEqual(capture(sig([1, 2, 3])), [1, 2, 3])
})

test('sig should support adding custom adapters', assert => {
  sig.adapts(test, adapt)
  const ee = new EventEmitter()
  const results = capture(sig(ee, 'foo'))

  assert.truthy(!results.length)
  ee.emit('foo', 21)
  ee.emit('foo', 22)
  ee.emit('foo', 23)
  assert.deepEqual(results, [21, 22, 23])

  function test(obj) {
    return obj instanceof EventEmitter
  }

  function adapt(obj, eventName) {
    const s = sig()
    obj.on(eventName, listener)
    s.teardown(teardown)
    return s

    function teardown() {
      obj.removeListener(listener)
    }

    function listener(v) {
      s.put(v)
    }
  }
})

test('sig should throw an error if the arguments cannot be adapted', assert => {
  sig._adapters_ = []

  assert.throws(
    function () {
      sig(21, 22, 23)
    },
    { message: /No sig adapter found for arguments: 21, 22, 23/ }
  )
})

// ## pausing and resuming
test('sig should support signal pausing and resuming', assert => {
  const results = []
  const s = sig()
  const t = sig()
  const u = sig()

  u.handlers.value = function (v) {
    results.push(v)
    this.next()
  }

  s.then(t).then(u).done()

  s.pause()
  t.pause()

  s.put(1)
  assert.truthy(!results.length)

  s.resume()
  assert.truthy(!results.length)

  t.resume()
  assert.deepEqual(results, [1])

  s.put(2)
  assert.deepEqual(results, [1, 2])

  t.pause()
  s.put(3)
  assert.deepEqual(results, [1, 2])

  t.resume()
  assert.deepEqual(results, [1, 2, 3])

  s.pause()
  s.put(4)

  s.resume()
  assert.deepEqual(results, [1, 2, 3, 4])
})

// ## ending
test('sig should mark the signal as ended', assert => {
  const s = sig()
  assert.truthy(!s.ended)
  s.end()
  assert.truthy(s.ended)
})

test("sig should clear the signal's state", assert => {
  const a = sig()
  const b = a.then(function (v) {
    this.put(v)
  })
  const c = b.then(sig())
  c.done()

  b.pause()

  a.put(21).put(23)

  assert.is(b.source, a)
  assert.deepEqual(b.targets, [c])
  assert.truthy(b.inBuffer.length)
  assert.truthy(b.outBuffer.length)
  assert.truthy(!a.ending)

  b.resume().end()
  assert.is(b.source, null)
  assert.truthy(!b.targets.length)
  assert.truthy(!b.inBuffer.length)
  assert.truthy(!b.outBuffer.length)
  assert.truthy(!a.ending)
})

test('sig should end its targets', assert => {
  const a = sig()
  const b = a.then(sig()).done()
  const c = b.then(sig()).done()
  const d = b.then(sig()).done()

  assert.truthy(!a.ended)
  assert.truthy(!b.ended)
  assert.truthy(!c.ended)
  assert.truthy(!d.ended)

  a.end()
  assert.truthy(a.ended)
  assert.truthy(b.ended)
  assert.truthy(c.ended)
  assert.truthy(d.ended)
})

test('sig should disconnect the signal', assert => {
  const a = sig()
  const b = sig()
  const c = sig()
  const d = sig()
  const e = sig()

  a.then(b)
  b.then(c).done()
  b.then(d).done()
  //       a
  //       |
  //       v
  //  ---- b
  // |     |
  // v     v
  // c     d     e
  assert.truthy(!a.disconnected)
  assert.truthy(!b.disconnected)
  assert.truthy(!c.disconnected)
  assert.truthy(!d.disconnected)
  assert.deepEqual(a.targets, [b])
  assert.deepEqual(b.source, a)
  assert.deepEqual(b.targets, [c, d])
  assert.deepEqual(c.source, b)
  assert.is(d.source, b)

  c.end()
  //       a
  //       |
  //       v
  //       b
  //       |
  //       v
  // c     d     e
  assert.truthy(!a.disconnected)
  assert.truthy(!b.disconnected)
  assert.truthy(c.disconnected)
  assert.truthy(!d.disconnected)
  assert.deepEqual(a.targets, [b])
  assert.is(b.source, a)
  assert.deepEqual(b.targets, [d])
  assert.is(c.source, null)
  assert.is(d.source, b)

  d.end()
  //       a
  //
  //
  //       b
  //
  //
  // c     d     e
  assert.truthy(a.disconnected)
  assert.truthy(b.disconnected)
  assert.truthy(c.disconnected)
  assert.truthy(d.disconnected)
  assert.truthy(!a.targets.length)
  assert.is(b.source, a)
  assert.truthy(!b.targets.length)
  assert.is(c.source, null)
  assert.is(d.source, null)

  b.then(e).done()
  //       a
  //       |
  //       v
  //       b ----
  //             |
  //             v
  // c     d     e
  assert.truthy(!a.disconnected)
  assert.truthy(!b.disconnected)
  assert.truthy(c.disconnected)
  assert.truthy(d.disconnected)
  assert.deepEqual(a.targets, [b])
  assert.is(b.source, a)
  assert.deepEqual(b.targets, [e])
  assert.is(c.source, null)
  assert.is(d.source, null)
  assert.is(e.source, b)
})

test('sig should delay signal ending until the buffer is clear', assert => {
  const s = sig([1, 2, 3]).end()
  assert.truthy(!s.ended)
  assert.truthy(s.ending)
  s.each(function () {}).done()
  assert.truthy(s.ended)
  assert.truthy(!s.ending)
})

test('sig should not allow values to propagate from dead signals', assert => {
  const a = sig()
  const b = sig()
  const c = sig()
  let results = capture(b)

  a.targets = [b]
  a.resume().put(21)
  assert.deepEqual(results, [21])

  a.end()
  results = capture(c)
  a.targets = [c]
  a.put(23)
  assert.truthy(!results.length)
})

test('sig should rethrow errors thrown from dead signals', assert => {
  const a = sig().resume()
  const e = new Error('o_O')
  assert.notThrows(thrower)
  a.end()
  assert.throws(thrower, { message: /o_O/ })

  function thrower() {
    a.throw(e)
  }
})

test('sig should not allow targets to be added to dead signals', assert => {
  const a = sig().end()
  const b = a.then(sig())
  const c = a.then(function () {})
  b.done()
  c.done()
  assert.truthy(!a.targets.length)
  assert.is(b.source, null)
  assert.is(c.source, null)
})

test('sig should not allow dead signals to be re-ended', assert => {
  const s = sig()
  const ends = s.event('end').call(counter)

  s.end().end().end()

  assert.is(ends(), 1)
})

test('sig should not allow ending signals to be re-ended', assert => {
  const s = sig()
  const endings = s.event('ending').call(counter)

  s.end().end().end()

  assert.is(endings(), 1)
})

test('sig should not allow dead signals to be re-killed', assert => {
  const s = sig()
  const ends = s.event('end').call(counter)

  s.end().kill().kill()

  assert.is(ends(), 1)
})

test('sig should allow ending signals to be killed', assert => {
  const s = sig([23]).end()
  assert.truthy(s.ending)
  assert.truthy(!s.ended)
  s.kill()
  assert.truthy(s.ended)
})

test('sig should support forced ends', assert => {
  const s = sig([1, 2, 3]).end()
  assert.truthy(!s.ended)
  s.kill()
  assert.truthy(s.ended)
})

// ## error handling
test('sig should support error handling', assert => {
  const s = sig()
  const t = s.then(sig())
  const results = capture(t)
  const e1 = new Error(':/')
  const e2 = new Error('o_O')

  t.handlers.error = function (e) {
    this.put(e).next()
  }

  assert.truthy(!results.length)

  s.throw(e1)
  assert.is(results.length, 1)
  assert.is(results[0], e1)

  s.throw(e2)
  assert.is(results.length, 2)
  assert.is(results[0], e1)
  assert.is(results[1], e2)
})

test('sig should allow errors to propagate', assert => {
  const s1 = sig()
  const s2 = sig()
  const s3 = sig()
  const s4 = sig()
  let s3Err, s4Err

  const e1 = new Error('o_O')
  const e2 = new Error(':|')

  s1.then(s2)
  s2.then(s3).done()
  s2.then(s4).done()

  s2.handlers.error = function (caughtErr) {
    if (caughtErr.message != ':|') this.throw(caughtErr)
  }

  s3.handlers.error = function (caughtErr) {
    s3Err = caughtErr
  }

  s4.handlers.error = function (caughtErr) {
    s4Err = caughtErr
  }

  s1.throw(e1).throw(e2)

  assert.is(s3Err, e1)
  assert.is(s4Err, e1)
})

test.cb('sig should handle errors thrown in value handlers', assert => {
  const s = sig()
  const t = s.then(sig())
  const u = t.then(sig()).done()
  const e = new Error('o_O')

  t.handlers.value = function () {
    this.throw(e)
  }

  u.handlers.error = function (caughtErr) {
    assert.is(caughtErr, e)
    assert.end()
  }

  s.put()
})

test.cb('sig should handle errors thrown in error handlers', assert => {
  const s = sig()
  const t = s.then(sig())
  const u = t.then(sig()).done()
  const e = new Error('o_O')

  t.handlers.error = function () {
    this.throw(e)
  }

  u.handlers.error = function (caughtErr) {
    assert.is(caughtErr, e)
    assert.end()
  }

  s.throw(new Error(':/'))
})

// ## then()
test('then() should support connecting to an existing target', assert => {
  const s = sig()
  const t = sig()
  s.then(t)
  assert.deepEqual(s.targets, [t])
  assert.is(t.source, s)
})

test('then() should support creating and connecting to a new target', assert => {
  const s = sig()
  const t = s.then(handler)
  assert.deepEqual(s.targets, [t])
  assert.is(t.source, s)
  assert.is(t.handlers.value, handler)
  function handler() {}
})

test.cb('then() should allow extra arguments to be given', assert => {
  const s = sig()

  s.then(fn, 2, 3).done(assert.end)

  s.put(1).end()

  function fn(a, b, c) {
    assert.is(a, 1)
    assert.is(b, 2)
    assert.is(c, 3)
    this.next()
  }
})

// ## catch()
test.cb('catch() should create a signal that catches errors', assert => {
  const s = sig()
  const e = new Error(':/')

  const t = s.catch(fn).done(assert.end)

  assert.not(t, s)

  s.throw(e).end()

  function fn(caughtErr) {
    assert.is(caughtErr, e)
    this.next()
  }
})

test.cb('catch() should support extra arguments', assert => {
  const s = sig()

  s.catch(fn, 1, 2).done(assert.end)

  s.throw(new Error(':/')).end()

  function fn(caughtErr, a, b) {
    assert.is(a, 1)
    assert.is(b, 2)
    this.next()
  }
})

// ## done()
test('done() should start the signal chain', assert => {
  const s = sig()
  const t = s.then(sig())
  assert.truthy(!s.started)
  assert.truthy(!t.started)
  t.done()
  assert.truthy(s.started)
  assert.truthy(t.started)
})

test('done() should callback when the signal ends', assert => {
  const s = sig()
  let calls = 0

  s.done(function () {
    calls++
  })

  assert.is(calls, 0)
  s.end()
  assert.is(calls, 1)
})

test.cb(
  'done() should callback for immediately ended signal chains',
  assert => {
    const results = []

    sig([1, 2, 3])
      .end()
      .each(function (v) {
        results.push(v)
      })
      .done(function () {
        assert.deepEqual(results, [1, 2, 3])
        assert.end()
      })
  }
)

test('done() should errback when the signal encounters an error', assert => {
  const s = sig()
  const err1 = new Error(':/')
  let calls = 0
  let err2

  s.done(function (err) {
    calls++
    err2 = err
  })

  assert.is(calls, 0)
  s.throw(err1)
  assert.is(calls, 1)
  assert.is(err1, err2)
})

test.cb('done() should allow no callback to be given', assert => {
  const s = sig()

  s.done().teardown(assert.end)

  s.end()
})

test('done() should rethrow errors if no callback is given', assert => {
  const s = sig()
  s.done()
  assert.throws(thrower, { message: /o_O/ })

  function thrower() {
    s.throw(new Error('o_O'))
  }
})

test('done() should kill on an error if a callback is given', assert => {
  const s = sig([1, 2, 3])
  s.done(function () {})

  assert.truthy(!s.ended)
  s.throw(':/')
  assert.truthy(s.ended)
})

test('done() should kill on an error if no callback is given', assert => {
  const s = sig([1, 2, 3])
  s.done(function () {})

  assert.truthy(!s.ended)
  try {
    s.throw(':/')
  } catch (err) {
    null
  }

  assert.truthy(s.ended)
})

test('done() should discard values', assert => {
  const results = sig([1, 2, 3]).done().call(capture)

  assert.truthy(!results.length)
})

// ## teardown()
test('teardown() should call the function when a signal is ended', assert => {
  const s = sig()
  let run = false

  s.teardown(function () {
    run = true
    assert.is(this, s)
  })

  assert.truthy(!run)
  s.end()
  assert.truthy(run)
})

test('teardown() should get called immediately if the signal is dead', assert => {
  const s = sig().end()
  let run = false

  s.teardown(function () {
    run = true
    assert.is(this, s)
  })

  assert.truthy(run)
})

// ## each()
test.cb('each() should process each value given by the signal', assert => {
  const s = sig()

  s.each(function (x) {
    this.put(x * 2)
  })
    .each(function (x) {
      this.put(x + 1)
    })
    .call(sink, assert.deepEqual, [3, 5, 7, 9])
    .done(assert.end)

  s.putEach([1, 2, 3, 4]).end()
})

test.cb('each() should allow additional args', assert => {
  function fn(a, b, c) {
    this.put([a, b, c])
  }

  const s = sig()

  s.each(fn, 23, 32)
    .call(sink, assert.deepEqual, [
      [1, 23, 32],
      [2, 23, 32],
      [3, 23, 32],
      [4, 23, 32]
    ])
    .done(assert.end)

  s.putEach([1, 2, 3, 4]).end()
})

test('each() should propagate natively thrown errors', assert => {
  const results = sig(['o_O', '-_-', ':/'])
    .each(function (v) {
      throw new Error(v)
    })
    .catch(function (e) {
      this.put(e.message).next()
    })
    .call(capture)

  assert.deepEqual(results, ['o_O', '-_-', ':/'])
})

// ## map()
test.cb('map() should map the given signal', assert => {
  const s = sig()

  s.map(function (x) {
    return x * 2
  })
    .map(function (x) {
      return x + 1
    })
    .call(sink, assert.deepEqual, [3, 5, 7, 9])
    .done(assert.end)

  s.putEach([1, 2, 3, 4]).end()
})

test.cb('map() should allow non-function values to be given', assert => {
  const s = sig()

  s.map(23).call(sink, assert.deepEqual, [23, 23, 23, 23]).done(assert.end)

  s.putEach([1, 2, 3, 4]).end()
})

test.cb('map() should allow additional args', assert => {
  function fn(a, b, c) {
    return [a, b, c]
  }

  const s = sig()

  s.map(fn, 23, 32)
    .call(sink, assert.deepEqual, [
      [1, 23, 32],
      [2, 23, 32],
      [3, 23, 32],
      [4, 23, 32]
    ])
    .done(assert.end)

  s.putEach([1, 2, 3, 4]).end()
})

// ## filter()
test.cb('filter() should filter the given signal', assert => {
  const s = sig()

  s.filter(function (x) {
    return x % 2
  })
    .filter(function (x) {
      return x < 10
    })
    .call(sink, assert.deepEqual, [3, 5])
    .done(assert.end)

  s.putEach([2, 3, 4, 5, 6, 11, 12, 15, 16]).end()
})

test.cb('filter() should allow additional args', assert => {
  const s = sig()

  s.filter(fn, 3, 2).call(sink, assert.deepEqual, [1, 3]).done(assert.end)

  s.putEach([1, 2, 3, 4]).end()

  function fn(a, b, c) {
    return (a * b) % c
  }
})

test.cb('filter() should default to an identity function', assert => {
  const s = sig()

  s.filter().call(sink, assert.deepEqual, [1, 3]).done(assert.end)

  s.putEach([1, 0, 3, null]).end()
})

// ## flatten
test.cb('flatten() should flatten the given signal', assert => {
  const s = sig()

  s.flatten()
    .limit(10)
    .call(sink, assert.deepEqual, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    .done(assert.end)

  s.putEach([1, [2, [3, [4, 5, [6, 7, 8, [9, [10]]]]]]]).end()
})

// ## limit()
test.cb('limit() should limit the given signal', assert => {
  const s = sig()

  s.limit(3).call(sink, assert.deepEqual, [1, 2, 3]).done(assert.end)

  s.putEach([1, 2, 3, 4, 5, 6]).end()
})

test('limit() should end the signal chain once the limit is reached', assert => {
  const s = sig()
  s.limit(3).then(sig()).done()

  assert.truthy(!s.disconnected)

  s.put(1)
  assert.truthy(!s.disconnected)

  s.put(2)
  assert.truthy(!s.disconnected)

  s.put(3)
  assert.truthy(s.disconnected)
})

test.cb('limit() should not output anything if the limit is 0', assert => {
  const s = sig()

  s.limit(0).call(sink, assert.deepEqual, []).done(assert.end)

  s.putEach([1, 2, 3, 4, 5, 6]).end()
})

// ## once
test.cb('once() should limit a signal to its first output', assert => {
  const s = sig()

  s.once().call(sink, assert.deepEqual, [1]).done(assert.end)

  s.putEach([1, 2, 3, 4, 5, 6]).end()
})

test('once() should end the signal chain after outputting a value', assert => {
  const s = sig()
  s.once().then(sig()).done()

  assert.truthy(!s.disconnected)
  s.put(23)
  assert.truthy(s.disconnected)
})

// ## isSig
test('isSig() should determine whether something is a signal', assert => {
  assert.truthy(!sig.isSig(void 0))
  assert.truthy(!sig.isSig(null))
  assert.truthy(!sig.isSig({}))
  assert.truthy(sig.isSig(sig()))
})

// ## spread()
test("spread() should spread an array out as a function's arguments", assert => {
  const results = sig.spread([1, 2, 3], function (a, b, c) {
    return [a + 1, b + 1, c + 1]
  })

  assert.deepEqual(results, [2, 3, 4])
})

// ## any()
test('any() should support arrays with both signals and non-signals', assert => {
  const a = sig()
  const b = sig()
  const results = capture(sig.any([a, b, 23]))
  assert.truthy(!results.length)

  a.put(1)
  assert.deepEqual(results, [[1, 0]])

  b.put(2)
  assert.deepEqual(results, [
    [1, 0],
    [2, 1]
  ])

  a.put(3)
  assert.deepEqual(results, [
    [1, 0],
    [2, 1],
    [3, 0]
  ])

  b.put(4)
  assert.deepEqual(results, [
    [1, 0],
    [2, 1],
    [3, 0],
    [4, 1]
  ])
})

test('any() should support objects with both signals and non-signals', assert => {
  const a = sig()
  const b = sig()

  const results = capture(
    sig.any({
      a: a,
      b: b,
      c: 23
    })
  )

  assert.truthy(!results.length)

  a.put(1)
  assert.deepEqual(results, [[1, 'a']])

  b.put(2)
  assert.deepEqual(results, [
    [1, 'a'],
    [2, 'b']
  ])

  a.put(3)
  assert.deepEqual(results, [
    [1, 'a'],
    [2, 'b'],
    [3, 'a']
  ])

  b.put(4)
  assert.deepEqual(results, [
    [1, 'a'],
    [2, 'b'],
    [3, 'a'],
    [4, 'b']
  ])
})

test('any() should handle errors from its source signals', assert => {
  const a = sig()
  const b = sig()
  const results = captureErrors(sig.any([a, b]))

  a.throw(new Error(':/'))
  b.throw(new Error(':|'))
  a.throw(new Error('o_O'))
  b.throw(new Error('-_-'))

  assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
})

test('any() should support argument objects', assert => {
  function run() {
    return sig.any(arguments).call(capture)
  }

  assert.deepEqual(run(sig.ensureVal(1), sig.ensureVal(2)), [
    [1, 0],
    [2, 1]
  ])
})

// ## all()
test('all() should support arrays with only non signals', assert => {
  const s = sig.all([21, 22, 23])
  assert.deepEqual(capture(s), [[21, 22, 23]])
})

test('all() should support objects with only non signals', assert => {
  const s = sig.all({
    a: 21,
    b: 22,
    c: 23
  })

  assert.deepEqual(capture(s), [
    {
      a: 21,
      b: 22,
      c: 23
    }
  ])
})

test('all() should support arrays with both signals and non-signals', assert => {
  const a = sig()
  const b = sig()

  const results = capture(sig.all([a, b, 23]))
  assert.truthy(!results.length)

  a.put(1)
  assert.truthy(!results.length)

  b.put(2)
  assert.deepEqual(results, [[1, 2, 23]])

  a.put(3)
  assert.deepEqual(results, [
    [1, 2, 23],
    [3, 2, 23]
  ])

  b.put(4)
  assert.deepEqual(results, [
    [1, 2, 23],
    [3, 2, 23],
    [3, 4, 23]
  ])
})

test('all() should support objects with both signals and non-signals', assert => {
  const a = sig()
  const b = sig()

  const results = capture(
    sig.all({
      a: a,
      b: b,
      c: 23
    })
  )

  assert.truthy(!results.length)

  a.put(1)

  assert.truthy(!results.length)

  b.put(2)

  assert.deepEqual(results, [
    {
      a: 1,
      b: 2,
      c: 23
    }
  ])

  a.put(3)

  assert.deepEqual(results, [
    {
      a: 1,
      b: 2,
      c: 23
    },
    {
      a: 3,
      b: 2,
      c: 23
    }
  ])

  b.put(4)

  assert.deepEqual(results, [
    {
      a: 1,
      b: 2,
      c: 23
    },
    {
      a: 3,
      b: 2,
      c: 23
    },
    {
      a: 3,
      b: 4,
      c: 23
    }
  ])
})

test('all() should output copies of a given array', assert => {
  const a = sig()
  const results = capture(sig.all([a, 23]))

  a.put(1).put(2).put(3)

  assert.is(results.length, 3)
  assert.not(results[0], results[1])
  assert.not(results[1], results[2])
  assert.not(results[2], results[0])
})

test('should output copies of a given object', assert => {
  const a = sig()

  const results = capture(
    sig.all({
      a: a,
      b: 23
    })
  )

  a.put(1).put(2).put(3)

  assert.is(results.length, 3)
  assert.not(results[0], results[1])
  assert.not(results[1], results[2])
  assert.not(results[2], results[0])
})

test('all() should handle errors from its source signals', assert => {
  const a = sig()
  const b = sig()
  const results = captureErrors(sig.all([a, b]))

  a.throw(new Error(':/'))
  b.throw(new Error(':|'))
  a.throw(new Error('o_O'))
  b.throw(new Error('-_-'))

  assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
})

// ## merge()
test('merge() should support arrays with both signals and non-signals', assert => {
  const a = sig()
  const b = sig()

  const results = capture(sig.merge([a, b, 23]))
  assert.truthy(!results.length)

  a.put(1)
  assert.deepEqual(results, [1])

  b.put(2)
  assert.deepEqual(results, [1, 2])

  a.put(3)
  assert.deepEqual(results, [1, 2, 3])

  b.put(4)
  assert.deepEqual(results, [1, 2, 3, 4])
})

test('merge() should support objects with both signals and non-signals', assert => {
  const a = sig()
  const b = sig()

  const results = capture(
    sig.merge({
      a: a,
      b: b,
      c: 23
    })
  )

  assert.truthy(!results.length)

  a.put(1)
  assert.deepEqual(results, [1])

  b.put(2)
  assert.deepEqual(results, [1, 2])

  a.put(3)
  assert.deepEqual(results, [1, 2, 3])

  b.put(4)
  assert.deepEqual(results, [1, 2, 3, 4])
})

test('merge() should handle errors from its source signals', assert => {
  const a = sig()
  const b = sig()
  const results = captureErrors(sig.merge([a, b]))

  a.throw(new Error(':/'))
  b.throw(new Error(':|'))
  a.throw(new Error('o_O'))
  b.throw(new Error('-_-'))

  assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
})

test('merge() should support argument objects', assert => {
  function run() {
    return sig.merge(arguments).call(capture)
  }

  assert.deepEqual(run(sig.ensureVal(1), sig.ensureVal(2)), [1, 2])
})

// ## update()
test('update() should update the signal to use the last returned signal', assert => {
  const s = sig()

  const results = s
    .update(function (u) {
      return u.map(function (x) {
        return x * 2
      })
    })
    .call(capture)

  const t = sig()
  s.put(t)
  t.putEach([1, 2, 3])

  const u = sig()
  s.put(u)

  u.putEach([4, 5, 6])
  t.putEach([7, 8, 9])
  assert.deepEqual(results, [2, 4, 6, 8, 10, 12])
})

test('update() should support additional args', assert => {
  const s = sig()

  const results = s
    .update(sig.map, function (x) {
      return x * 2
    })
    .call(capture)

  const t = sig()
  s.put(t)

  t.put(1).put(2).put(3)

  assert.deepEqual(results, [2, 4, 6])
})

test('update() should default to an identity function', assert => {
  const s = sig()

  const results = s.update().call(capture)

  const t = sig()
  s.put(t)

  t.put(1).put(2).put(3)

  assert.deepEqual(results, [1, 2, 3])
})

test('update() should do nothing if a non-signal is returned', assert => {
  const s = sig()

  const results = s
    .update(function (x) {
      if (x % 2) return sig.val(x)
    })
    .call(capture)

  s.put(1).put(2).put(3).put(4).put(5)

  assert.deepEqual(results, [1, 3, 5])
})

// ## append()
test('append() should append each returned signal', assert => {
  const s = sig()

  const results = s
    .append(function (u) {
      return u.map(function (x) {
        return x * 2
      })
    })
    .call(capture)

  const t = sig()
  s.put(t)

  t.put(1).put(2).put(3)

  const u = sig()
  s.put(u)

  u.put(4).put(5).put(6)

  t.put(7).put(8).put(9)

  assert.deepEqual(results, [2, 4, 6, 8, 10, 12, 14, 16, 18])
})

test('append() should support additional args', assert => {
  const s = sig()

  const results = s
    .append(sig.map, function (x) {
      return x * 2
    })
    .call(capture)

  const t = sig()
  s.put(t)

  t.put(1).put(2).put(3)

  const u = sig()
  s.put(u)

  u.put(4).put(5).put(6)

  assert.deepEqual(results, [2, 4, 6, 8, 10, 12])
})

test('append() should default to an identity function', assert => {
  const s = sig()
  const results = capture(s.append())

  const t = sig()
  s.put(t)

  t.put(1).put(2).put(3)

  assert.deepEqual(results, [1, 2, 3])
})

test('append() should do nothing if a non-signal is returned', assert => {
  const s = sig()

  const results = s
    .append(function (x) {
      if (x % 2) return sig.val(x)
    })
    .call(capture)

  s.put(1).put(2).put(3).put(4).put(5)

  assert.deepEqual(results, [1, 3, 5])
})

// ## val()
test('val() should hold last value given to the signal', assert => {
  const s = sig.val(2)
  const results = capture(s)
  assert.deepEqual(results, [2])

  s.put(3)
  assert.deepEqual(results, [2, 3])

  s.put(4)
  assert.deepEqual(results, [2, 3, 4])
})

// ## ensureVal()
test('ensureVal() should return a sticky signal if a value is given', assert => {
  assert.deepEqual(sig.ensureVal(23).call(capture), [23])
})

test('ensureVal() should return sticky target signal if a signal is given', assert => {
  const s = sig()
  const t = sig.ensureVal(s)
  s.put(23)

  assert.deepEqual(t.call(capture), [23])
  assert.deepEqual(t.call(capture), [23])
})

// ## to()
test('to() should redirect signal output', assert => {
  const s = sig()
  const t = sig()
  const results = capture(t)

  s.to(t)

  s.put(1).put(2).put(3)

  assert.deepEqual(results, [1, 2, 3])
})

test.cb('to() should redirect signal errors', assert => {
  const s = sig()
  const t = sig()
  const e = new Error(':/')

  s.to(t)

  t.catch(function (nextE) {
    assert.is(e, nextE)
    assert.end()
  }).done()

  s.throw(e)
})

test('to() should disconnect when the target has ended', assert => {
  const s = sig()
  const t = sig()
  const u = s.to(t)

  assert.truthy(!u.disconnected)
  t.end()
  assert.truthy(u.disconnected)
})

test('to() should disconnect when the target disconnects', assert => {
  const s = sig()
  const t = sig()
  const u = s.to(t)
  const v = t.done()

  assert.truthy(!u.disconnected)
  v.end()
  assert.truthy(u.disconnected)
})

test('to() should reconnect when the target reconnects', assert => {
  const s = sig()
  const t = sig()
  const u = s.to(t)
  t.done().end()

  assert.truthy(u.disconnected)
  t.then(sig()).done()
  assert.truthy(!u.disconnected)
})

// ## tap(fn)
test('tap() should call the given function', assert => {
  const s = sig()
  const results = []

  s.tap(function (v) {
    results.push(v)
  }).done()

  assert.truthy(!results.length)

  s.put(1).put(2).put(3)

  assert.deepEqual(results, [1, 2, 3])
})

test("tap() should propagate the source signal's values", assert => {
  const s = sig()

  const results = s.tap(function () {}).call(capture)

  assert.truthy(!results.length)

  s.put(1).put(2).put(3)

  assert.deepEqual(results, [1, 2, 3])
})

test('tap() should support extra arguments', assert => {
  const s = sig()
  const results = []

  s.tap(
    function (a, b, c) {
      results.push([a, b, c])
    },
    32,
    23
  ).done()

  assert.truthy(!results.length)

  s.put(1).put(2).put(3)

  assert.deepEqual(results, [
    [1, 32, 23],
    [2, 32, 23],
    [3, 32, 23]
  ])
})

// ## tap(t)
test('tap(t) should redirect to the target signal', assert => {
  const s = sig()
  const t = sig()
  const results = capture(t)

  s.tap(t).done()

  assert.truthy(!results.length)

  s.put(1).put(2).put(3)

  assert.deepEqual(results, [1, 2, 3])
})

test("tap(t) should propagate the source signal's values", assert => {
  const s = sig()

  const results = s.tap(sig()).call(capture)

  assert.truthy(!results.length)

  s.put(1).put(2).put(3)

  assert.deepEqual(results, [1, 2, 3])
})

test('tap(t) should stop redirecting when the returned signal ends', assert => {
  const s = sig()
  const t = sig()
  const u = s.tap(t)
  const results = capture(t)
  u.done()

  assert.truthy(!results.length)

  s.put(1).put(2).put(3)

  assert.deepEqual(results, [1, 2, 3])

  u.end()

  s.put(4).put(5).put(6)

  assert.deepEqual(results, [1, 2, 3])
})

test('tap(t) should continue propagating when the target disconnects', assert => {
  const s = sig()
  const t = sig()

  const results = s.tap(t).call(capture)

  assert.truthy(!results.length)

  s.put(1).put(2).put(3)

  assert.deepEqual(results, [1, 2, 3])

  t.end()

  s.put(4).put(5).put(6)

  assert.deepEqual(results, [1, 2, 3, 4, 5, 6])
})

// ## putTo()
test('putTo() should put the given value onto the given signal', assert => {
  const s = sig()
  const results = capture(s)
  sig.putTo(1, s)
  sig.putTo(2, s)
  sig.putTo(3, s)
  assert.deepEqual(results, [1, 2, 3])
})

// ## resolve()
test('resolve() should put the given value, then die', assert => {
  let ended = false

  sig()
    .teardown(function () {
      ended = true
    })
    .resolve(23)
    .call(capture, assert.deepEqual, [23])

  assert.truthy(ended)
})

// ## call()
test.cb('call() should call a function with the signal', assert => {
  const s = sig()
  s.call(fn, 23, 32)

  function fn(t, a, b) {
    assert.is(s, t)
    assert.is(a, 23)
    assert.is(b, 32)
    assert.end()
  }
})

// ## event()
test('event() should propagate a value each event emit', assert => {
  const s = sig()
  const results = s.event('foo').call(capture)

  sig._emit_(s, 'foo', 21)
  assert.deepEqual(results, [21])

  sig._emit_(s, 'foo', 22)
  assert.deepEqual(results, [21, 22])

  sig._emit_(s, 'foo', 23)
  assert.deepEqual(results, [21, 22, 23])
})

test('event() should stop listening when the event signal ends', assert => {
  const s = sig()
  const t = s.event('foo')
  assert.is(s.eventListeners.foo.length, 1)
  t.end()
  assert.truthy(!s.eventListeners.foo.length)
})

// ## functor()
test('functor() should simply return a function if one is given', assert => {
  function foo() {}
  assert.is(sig.functor(foo), foo)
})

test('functor() should wrap non-functions', assert => {
  const obj = {}
  assert.is(sig.functor(obj)(), obj)
})
