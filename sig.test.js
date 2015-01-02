var assert = require('assert')
var vv = require('drainpipe')


var sig = require('./sig'),
    reset = sig.reset,
    put = sig.put,
    source = sig.source,
    unsource = sig.unsource,
    pause = sig.pause,
    resume = sig.resume,
    cleanup = sig.cleanup,
    raise = sig.raise,
    except = sig.except,
    map = sig.map,
    filter = sig.filter,
    flatten = sig.flatten,
    limit = sig.limit,
    once = sig.once,
    then = sig.then,
    ensure = sig.ensure,
    any = sig.any,
    all = sig.all,
    update = sig.update,
    append = sig.append,
    spread = sig.spread,
    isSig = sig.isSig,
    val = sig.val,
    redir = sig.redir,
    to = sig.to


function capture(s) {
  var values = []

  then(s, function(x) {
    values.push(x)
  })

  return values
}


describe("sig", function() {
  it("should allow values to be sent through signals", function() {
    var src = sig()
    var results = []

    vv(src)
      (then, function(x) {
        if (x % 2) put(this, x)
      })
      (then, function(x) {
        put(this, x + 1)
      })
      (then, function(x) {
        results.push(x)
      })

    assert(!results.length)

    put(src, 1)
    assert.deepEqual(results, [2])

    put(src, 2)
    assert.deepEqual(results, [2])

    put(src, 3)
    assert.deepEqual(results, [2, 4])
  })

  it("should support top-down signal resets", function() {
    var a = sig()
    var b = sig()
    var c = sig()
    var d = sig()
    var e = sig()

    then(a, b)
    then(b, c)
    then(b, d)

    //       a
    //       |
    //       v
    //  ---- b      
    // |     |
    // v     v
    // c     d     e
    assert.deepEqual(a.targets, [b])
    assert.strictEqual(b.source, a)
    assert.deepEqual(b.targets, [c, d])
    assert.strictEqual(c.source, b)
    assert.strictEqual(d.source, b)

    reset(a)

    //       a
    //        
    //        
    //       b      
    //        
    //        
    // c     d     e
    assert(!a.targets.length)
    assert.strictEqual(b.source, null)
    assert(!b.targets.length)
    assert.strictEqual(c.source, null)
    assert.strictEqual(d.source, null)

    then(b, e)

    //       a
    //        
    //        
    //       b ----
    //             |
    //             v
    // c     d     e
    assert(!a.targets.length)
    assert.strictEqual(b.source, null)
    assert.deepEqual(b.targets, [e])
    assert.strictEqual(c.source, null)
    assert.strictEqual(d.source, null)
    assert.strictEqual(e.source, b)
  })

  it("should support bottom-up signal resets", function() {
    var a = sig()
    var b = sig()
    var c = sig()
    var d = sig()
    var e = sig()

    then(a, b)
    then(b, c)
    then(b, d)

    //       a
    //       |
    //       v
    //  ---- b      
    // |     |
    // v     v
    // c     d     e
    assert.deepEqual(a.targets, [b])
    assert.deepEqual(b.source, a)
    assert.deepEqual(b.targets, [c, d])
    assert.deepEqual(c.source, b)
    assert.deepEqual(d.source, b)

    reset(c)

    //       a
    //       |
    //       v
    //       b      
    //       |
    //       v
    // c     d     e
    assert.deepEqual(a.targets, [b])
    assert.strictEqual(b.source, a)
    assert.deepEqual(b.targets, [d])
    assert.strictEqual(c.source, null)
    assert.deepEqual(d.source, b)

    reset(d)

    //       a
    //        
    //        
    //       b      
    //        
    //        
    // c     d     e
    assert(!a.targets.length)
    assert.deepEqual(b.source, a)
    assert(!b.targets.length)
    assert.strictEqual(c.source, null)
    assert.strictEqual(d.source, null)

    then(b, e)

    //       a
    //       |
    //       v
    //       b ----
    //             |
    //             v
    // c     d     e
    assert.deepEqual(a.targets, [b])
    assert.strictEqual(b.source, a)
    assert.deepEqual(b.targets, [e])
    assert.strictEqual(c.source, null)
    assert.strictEqual(d.source, null)
    assert.strictEqual(e.source, b)
  })

  it("should support error handling", function(done) {
    var s = sig()
    var e = new Error(':/')

    s.errorHandler = function(caughtErr) {
      assert.strictEqual(caughtErr, e)
      done()
    }

    raise(s, e)
  })

  it("should throw unhandled errors", function() {
    function thrower() {
      raise(sig(), new Error('o_O'))
    }

    assert.throws(thrower, /o_O/)
  })

  it("should unset errors even if error handlers throw errors", function() {
    var s = sig()

    try { raise(s, 'o_O') }
    catch (e) {}

    assert.strictEqual(s.error, null)
  })

  it("should allow handlers of ending signals to rethrow errors", function() {
    var s = sig()

    s.errorHandler = function(e) {
      raise(s, new Error(e + '!'))
    }

    function thrower() {
      raise(s, new Error('o_O'))
    }

    assert.throws(thrower, /o_O!/)
  })

  it("should allow errors to propogate", function() {
    var s1 = sig()
    var s2 = sig()
    var s3 = sig()
    var s4 = sig()
    var s3Err, s4Err

    var e1 = new Error('o_O')
    var e2 = new Error(':|')

    then(s1, s2)
    then(s2, s3)
    then(s2, s4)

    s1.errorHandler = function(caughtErr) {
      if (caughtErr.message != ':|') raise(this, caughtErr)
    }

    s3.errorHandler = function(caughtErr) {
      s3Err = caughtErr
    }

    s4.errorHandler = function(caughtErr) {
      s4Err = caughtErr
    }

    raise(s1, e1)
    raise(s1, e2)
    assert.strictEqual(s3Err, e1)
    assert.strictEqual(s4Err, e1)
  })

  it("should catch and raise errors raised in receivers", function(done) {
    var s = sig()
    var t = sig()
    var e = new Error('o_O')

    t.receiver = function() {
      raise(t, e)
    }

    t.errorHandler = function(caughtErr) {
      assert.strictEqual(caughtErr, e)
      done()
    }

    source(t, s)
    put(s)
  })

  it("should support signal pausing and resuming", function() {
    var results = []
    var s = sig()
    var t = sig()
    var u = sig()
    u.receiver = function(x) { results.push(x) }

    vv(s)
      (then, t)
      (then, u)

    pause(s)
    pause(t)

    put(s, 1)
    assert(!results.length)

    resume(s)
    assert(!results.length)

    resume(t)
    assert.deepEqual(results, [1])

    put(s, 2)
    assert.deepEqual(results, [1, 2])

    pause(t)
    put(s, 3)
    assert.deepEqual(results, [1, 2])

    resume(t)
    assert.deepEqual(results, [1, 2, 3])

    pause(s)
    put(s, 4)

    resume(s)
    assert.deepEqual(results, [1, 2, 3, 4])
  })

  it("should support eager signals", function() {
    var s1 = sig()
    var s2 = sig()
    var t1 = sig()
    var t2 = sig()

    s1.eager = true
    s2.eager = false

    assert(s1.paused)
    assert(s2.paused)

    then(s1, t1)
    assert(!s1.paused)

    then(s2, t2)
    assert(s2.paused)
  })

  it("should not allow multiple source signals", function() {
    var t = sig()

    function addSource() {
      source(t, sig())
    }

    addSource()

    assert.throws(
        addSource,
        /Cannot set signal's source, signal already has a source/)
  })

  it("should allow multiple target signals", function() {
    var results1 = []
    var results2 = []
    var s = sig()

    var t1 = sig()
    t1.receiver = function(x) { results1.push(x) }

    var t2 = sig()
    t2.receiver = function(x) { results2.push(x) }

    then(s, t1)
    then(s, t2)

    vv(s)
      (put, 1)
      (put, 2)
      (put, 3)
      (put, 4)

    assert.deepEqual(results1, [1, 2, 3, 4])
    assert.deepEqual(results2, [1, 2, 3, 4])
  })

  it("should allow a target signal to be reset", function() {
    var results = []
    var s = sig()

    var t = sig()
    t.receiver = function(x) { results.push(x) }

    then(s, t)
    reset(t)

    put(s, 1)
    put(s, 2)

    assert(!results.length)
  })

  it("should allow a source signal to be reset", function() {
    var results1 = []
    var results2 = []
    var s = sig()

    var t1 = sig()
    t1.receiver = function(x) { results1.put(x) }

    var t2 = sig()
    t2.receiver = function(x) { results2.put(x) }

    then(s, t1)
    then(s, t2)
    reset(s)

    vv(s)
      (put, 1)
      (put, 2)
      (put, 3)
      (put, 4)

    assert(!results1.length)
    assert(!results2.length)
  })

  it("should allow a signal to stop sourceing another", function() {
    var results = []
    var s = sig()

    var t = sig()
    t.receiver = function(x) { results.push(x) }

    source(t, s)
    unsource(t, s)

    vv(s)
      (put, 1)
      (put, 2)
      (put, 3)
      (put, 4)

    assert(!results.length)
  })

  it("should act as an indentity for existing signals", function() {
    var s = sig()
    assert.strictEqual(sig(s), s)
  })

  it("should create a signal from an array of values", function() {
    vv([23])
      (sig)
      (capture)
      (assert.deepEqual, [23])

    vv([1, 2, 3, 4])
      (sig)
      (capture)
      (assert.deepEqual, [1, 2, 3, 4])
  })

  it("should support cleanup hooks", function() {
    var results = []

    var s = vv(sig())
      (cleanup, function() {
        results.push(1)
      })
      (cleanup, function() {
        results.push(2)
      })
      (cleanup, function() {
        results.push(3)
      })
      ()

    assert(!results.length)
    reset(s)
    assert.deepEqual(results, [1, 2, 3])
  })

  describe(".then", function() {
    it("should support connecting to an existing target", function() {
      var s = sig()
      var t = sig()
      then(s, t)
      assert.deepEqual(s.targets, [t])
      assert.strictEqual(t.source, s)
    })

    it("should support creating and connecting to a new target", function() {
      var s = sig()
      var t = then(s, receiver)
      assert.deepEqual(s.targets, [t])
      assert.strictEqual(t.source, s)
      assert.strictEqual(t.receiver, receiver)
      function receiver() {}
    })

    it("should allow extra arguments to be given", function(done) {
      var s = sig()

      then(s, function(a, b, c) {
        assert.equal(a, 1)
        assert.equal(b, 2)
        assert.equal(c, 3)
        done()
      }, 2, 3)

      put(s, 1)
    })
  })


  describe(".except", function(done) {
    it("should create a signal that catches errors", function(done) {
      var s = sig()
      var e = new Error(':/')

      var t = except(s, function(caughtErr) {
        assert.strictEqual(caughtErr, e)
        done()
      })

      assert.notStrictEqual(t, s)
      raise(s, e)
    })

    it("should support extra arguments", function(done) {
      var s = sig()

      except(s, function(caughtErr, a, b) {
        assert.strictEqual(a, 1)
        assert.strictEqual(b, 2)
        done()
      }, 1, 2)

      raise(s, new Error(':/'))
    })
  })


  describe(".map", function() {
    it("should map the given signal", function() {
      vv([1, 2, 3, 4])
        (sig)
        (map, function(x) { return x * 2 })
        (map, function(x) { return x + 1 })
        (capture)
        (assert.deepEqual, [3, 5, 7, 9])
    })

    it("should allow additional args", function() {
      function fn(a, b, c) {
        return [a, b, c]
      }

      vv([1, 2, 3, 4])
        (sig)
        (map, fn, 23, 32)
        (capture)
        (assert.deepEqual, [
          [1, 23, 32],
          [2, 23, 32],
          [3, 23, 32],
          [4, 23, 32]])
    })
  })


  describe(".filter", function() {
    it("should filter the given signal", function() {
      vv([2, 3, 4, 5, 6, 11, 12, 15, 16])
        (sig)
        (filter, function(x) { return x % 2 })
        (filter, function(x) { return x < 10 })
        (capture)
        (assert.deepEqual, [3, 5])
    })

    it("should allow additional args", function() {
      function fn(a, b, c) {
        return (a * b) % c
      }

      vv([1, 2, 3, 4])
        (sig)
        (filter, fn, 3, 2)
        (capture)
        (assert.deepEqual, [1, 3])
    })

    it("should default to an identity function", function() {
      vv([1, 0, 3, null])
        (sig)
        (filter)
        (capture)
        (assert.deepEqual, [1, 3])
    })
  })


  describe(".flatten", function() {
    it("should flatten the given signal", function() {
      vv([1, [2, [3, [4, 5, [6, 7, 8, [9, [10]]]]]]])
        (sig)
        (flatten)
        (capture)
        (assert.deepEqual, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })
  })


  describe(".limit", function() {
    it("should limit the given signal", function() {
      vv([1, 2, 3, 4, 5, 6])
        (sig)
        (limit, 3)
        (capture)
        (assert.deepEqual, [1, 2, 3])
    })
  })


  describe(".once", function() {
    it("should limit a signal to its first output", function() {
      vv([1, 2, 3, 4, 5, 6])
        (sig)
        (once)
        (capture)
        (assert.deepEqual, [1])
    })
  })


  describe(".isSig", function() {
    it("should determine whether something is a signal", function() {
      assert(!isSig(void 0))
      assert(!isSig(null))
      assert(!isSig({}))
      assert(isSig(sig()))
    })
  })


  describe(".spread", function() {
    it("should spread an array out as a function's arguments", function() {
      vv([1, 2, 3])
        (spread, function(a, b, c) {
          return [a + 1, b + 1, c + 1]
        })
        (spread, function(a, b, c) {
          return [a * 2, b * 2, c * 2]
        })
        (assert.deepEqual, [4, 6, 8])
    })
  })


  describe(".any", function() {
    it("should support arrays with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = vv([a, b, 23])
        (any)
        (capture)
        ()

      assert(!results.length)

      put(a, 1)
      assert.deepEqual(results, [[1, 0]])

      put(b, 2)
      assert.deepEqual(results, [[1, 0], [2, 1]])

      put(a, 3)
      assert.deepEqual(results, [[1, 0], [2, 1], [3, 0]])

      put(b, 4)
      assert.deepEqual(results, [[1, 0], [2, 1], [3, 0], [4, 1]])
    })
    
    it("should support objects with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = vv({
          a: a,
          b: b,
          c: 23
        })
        (any)
        (capture)
        ()

      assert(!results.length)

      put(a, 1)
      assert.deepEqual(results, [[1, 'a']])

      put(b, 2)
      assert.deepEqual(results, [[1, 'a'], [2, 'b']])

      put(a, 3)
      assert.deepEqual(results, [[1, 'a'], [2, 'b'], [3, 'a']])

      put(b, 4)
      assert.deepEqual(results, [[1, 'a'], [2, 'b'], [3, 'a'], [4, 'b']])
    })

    it("should reset all its listeners when the out signal is reset", function() {
      var a = sig()
      var b = sig()
      var s = any([a, b])
      assert.equal(a.targets.length, 1)
      assert.equal(b.targets.length, 1)

      reset(s)
      assert(!a.targets.length)
      assert(!b.targets.length)
    })

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      vv([a, b])
        (any)
        (except, function(e) {
          results.push(e.message)
        })

      raise(a, new Error(':/'))
      raise(b, new Error(':|'))
      raise(a, new Error('o_O'))
      raise(b, new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })

    it("should support argument objects", function() {
      function test() {
        vv(arguments)
          (any)
          (capture)
          (assert.deepEqual, [[1, 0], [2, 1]])
      }

      test(ensure(1), ensure(2))
    })
  })


  describe(".all", function() {
    it("should support arrays with only non signals", function() {
      vv([21, 22, 23])
       (all)
       (capture)
       (assert.deepEqual, [[21, 22, 23]])
    })

    it("should support objects with only non signals", function() {
      vv({
         a: 21,
         b: 22,
         c: 23
        })
        (all)
        (capture)
        (assert.deepEqual, [{
          a: 21,
          b: 22,
          c: 23
        }])
    })

    it("should support arrays with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = vv([a, b, 23])
        (all)
        (capture)
        ()

      assert(!results.length)

      put(a, 1)
      assert(!results.length)

      put(b, 2)
      assert.deepEqual(results, [[1, 2, 23]])

      put(a, 3)
      assert.deepEqual(results, [[1, 2, 23], [3, 2, 23]])

      put(b, 4)
      assert.deepEqual(results, [[1, 2, 23], [3, 2, 23], [3, 4, 23]])
    })
    
    it("should support objects with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = vv({
          a: a,
          b: b,
          c: 23 
        })
        (all)
        (capture)
        ()

      assert(!results.length)

      put(a, 1)

      assert(!results.length)

      put(b, 2)

      assert.deepEqual(results, [{
        a: 1,
        b: 2,
        c: 23
      }])

      put(a, 3)

      assert.deepEqual(results, [{
        a: 1,
        b: 2,
        c: 23
      }, {
        a: 3,
        b: 2,
        c: 23
      }])

      put(b, 4)

      assert.deepEqual(results, [{
        a: 1,
        b: 2,
        c: 23
      }, {
        a: 3,
        b: 2,
        c: 23
      }, {
        a: 3,
        b: 4,
        c: 23
      }])
    })

    it("should output copies of a given array", function() {
      var a = sig()

      var results = vv([a, 23])
        (all)
        (capture)
        ()

      put(a, 1)
      put(a, 2)
      put(a, 3)

      assert.equal(results.length, 3)
      assert.notStrictEqual(results[0], results[1])
      assert.notStrictEqual(results[1], results[2])
      assert.notStrictEqual(results[2], results[0])
    })

    it("should output copies of a given object", function() {
      var a = sig()

      var results = vv({
          a: a,
          b: 23
        })
        (all)
        (capture)
        ()

      put(a, 1)
      put(a, 2)
      put(a, 3)

      assert.equal(results.length, 3)
      assert.notStrictEqual(results[0], results[1])
      assert.notStrictEqual(results[1], results[2])
      assert.notStrictEqual(results[2], results[0])
    })

    it("should reset all its listeners when the out signal is reset", function() {
      var a = sig()
      var b = sig()
      var s = all([a, b])
      assert.equal(a.targets.length, 1)
      assert.equal(b.targets.length, 1)

      reset(s)
      assert(!a.targets.length)
      assert(!b.targets.length)
    })

    it("should work with signals with non-empty buffers", function() {
      var a = sig()
      put(a, 1)

      var b = sig()
      put(b, 2)

      vv([a, b])
        (all)
        (capture)
        (assert.deepEqual, [[1, 2]])
    })

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      vv([a, b])
        (all)
        (except, function(e) {
          results.push(e.message)
        })

      raise(a, new Error(':/'))
      raise(b, new Error(':|'))
      raise(a, new Error('o_O'))
      raise(b, new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })
  })


  describe(".update", function() {
    it("should update the signal to use the last returned signal", function() {
      var s = sig()
      var results = []

      vv(s)
        (update, function(u) {
          return map(u, function(x) { return x * 2 })
        })
        (then, function(v) {
          results.push(v)
        })

      var t = sig()
      put(s, t)

      vv(t)
        (put, 1)
        (put, 2)
        (put, 3)

      var u = sig()
      put(s, u)

      vv(u)
        (put, 4)
        (put, 5)
        (put, 6)

      vv(t)
        (put, 7)
        (put, 8)
        (put, 9)

      assert.deepEqual(results, [2, 4, 6, 8, 10, 12])
    })

    it("should support additional args", function() {
      var s = sig()
      var results = []

      vv(s)
        (update, map, function(x) { return x * 2 })
        (then, function(v) { results.push(v) })

      var t = sig()
      put(s, t)

      vv(t)
        (put, 1)
        (put, 2)
        (put, 3)

      assert.deepEqual(results, [2, 4, 6])
    })

    it("should default to an identity function", function() {
      var s = sig()
      var results = []

      vv(s)
        (update)
        (then, function(v) { results.push(v) })

      var t = sig()
      put(s, t)

      vv(t)
        (put, 1)
        (put, 2)
        (put, 3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should do nothing if a non-signal is returned", function() {
      var s = sig()
      var results = []

      vv(s)
        (update, function(x) { if (x % 2) return val(x) })
        (then, function(v) { results.push(v) })

      vv(s)
        (put, 1)
        (put, 2)
        (put, 3)
        (put, 4)
        (put, 5)

      assert.deepEqual(results, [1, 3, 5])
    })
  })


  describe(".append", function() {
    it("should append each returned signal", function() {
      var s = sig()
      var results = []

      vv(s)
        (append, function(u) {
          return map(u, function(x) { return x * 2 })
        })
        (then, function(v) {
          results.push(v)
        })

      var t = sig()
      put(s, t)

      vv(t)
        (put, 1)
        (put, 2)
        (put, 3)

      var u = sig()
      put(s, u)

      vv(u)
        (put, 4)
        (put, 5)
        (put, 6)

      vv(t)
        (put, 7)
        (put, 8)
        (put, 9)

      assert.deepEqual(results, [2, 4, 6, 8, 10, 12, 14, 16, 18])
    })

    it("should support additional args", function() {
      var s = sig()
      var results = []

      vv(s)
        (append, map, function(x) { return x * 2 })
        (then, function(v) { results.push(v) })

      var t = sig()
      put(s, t)

      vv(t)
        (put, 1)
        (put, 2)
        (put, 3)

      var u = sig()
      put(s, u)

      vv(u)
        (put, 4)
        (put, 5)
        (put, 6)

      assert.deepEqual(results, [2, 4, 6, 8, 10, 12])
    })

    it("should default to an identity function", function() {
      var s = sig()
      var results = []

      vv(s)
        (append)
        (then, function(v) { results.push(v) })

      var t = sig()
      put(s, t)

      vv(t)
        (put, 1)
        (put, 2)
        (put, 3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should do nothing if a non-signal is returned", function() {
      var s = sig()
      var results = []

      vv(s)
        (append, function(x) { if (x % 2) return val(x) })
        (then, function(v) { results.push(v) })

      vv(s)
        (put, 1)
        (put, 2)
        (put, 3)
        (put, 4)
        (put, 5)

      assert.deepEqual(results, [1, 3, 5])
    })
  })


  describe(".ensure", function() {
    it("should simply pass through existing signals", function() {
      vv([1, 2])
        (sig)
        (ensure)
        (capture)
        (assert.deepEqual, [1, 2])
    })

    it("should create a singleton signal from non-signals", function() {
      vv(23)
        (ensure)
        (capture)
        (assert.deepEqual, [23])

      vv([[1, 2], [3, 4]])
        (ensure)
        (capture)
        (assert.deepEqual, [[[1, 2], [3, 4]]])
    })
  })


  describe(".val", function() {
    it("should hold last value given to the signal", function() {
      var s = val(2)

      var c1 = capture(s)
      assert.deepEqual(c1, [2])

      put(s, 3)
      var c2 = capture(s)
      assert.deepEqual(c1, [2, 3])
      assert.deepEqual(c2, [3])

      put(s, 4)
      var c3 = capture(s)
      assert.deepEqual(c1, [2, 3, 4])
      assert.deepEqual(c2, [3, 4])
      assert.deepEqual(c3, [4])
    })

    it("should work for eager signals", function() {
      var s = val(2)
      s.eager = true
      assert.deepEqual(capture(s), [2])
    })

    it("should work for non-eager signals", function() {
      var s = val(2)
      s.eager = false
      resume(s)
      assert.deepEqual(capture(s), [2])
    })
  })

  describe(".redir", function() {
    it("should redirect signal output", function() {
      var s = sig()
      var t = sig()
      var results = capture(t)

      redir(s, t)

      vv(s)
        (put, 1)
        (put, 2)
        (put, 3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should redirect signal errors", function(done) {
      var s = sig()
      var t = sig()
      var e = new Error(':/') 

      redir(s, t)

      except(t, function(nextE) {
        assert.strictEqual(e, nextE)
        done()
      })

      raise(s, e)
    })

    it("should not redirect after the target has been reset", function() {
      var s = sig()
      var t = sig()
      var results = capture(t)

      redir(s, t)

      vv(s)
        (put, 1)
        (put, 2)
        (put, 3)

      assert.deepEqual(results, [1, 2, 3])

      reset(t)

      vv(s)
        (put, 4)
        (put, 5)
        (put, 6)

      assert.deepEqual(results, [1, 2, 3])
    })
  })

  describe(".to", function() {
    it("should put the given value onto the given signal", function() {
      var s = sig()
      to(1, s)
      to(2, s)
      to(3, s)

      assert.deepEqual(capture(s), [1, 2, 3])
    })
  })
})
