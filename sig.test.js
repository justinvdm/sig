var assert = require('assert')
var vv = require('drainpipe')


var sig = require('./sig'),
    reset = sig.reset,
    put = sig.put,
    watch = sig.watch,
    unwatch = sig.unwatch,
    pause = sig.pause,
    resume = sig.resume,
    cleanup = sig.cleanup,
    raise = sig.raise,
    except = sig.except,
    map = sig.map,
    filter = sig.filter,
    limit = sig.limit,
    once = sig.once,
    then = sig.then,
    ensure = sig.ensure,
    any = sig.any,
    all = sig.all,
    spread = sig.spread,
    depend = sig.depend,
    undepend = sig.undepend,
    isSig = sig.isSig,
    val = sig.val


function capture(s) {
  var values = []

  map(s, function(x) {
    values.push(x)
  })

  return values
}


describe("sig", function() {
  it("should allow values to be sent through signals", function() {
    var src = sig()
    var results = []

    vv(src)
      (then, function(s, x) {
        if (x % 2) put(s, x)
      })
      (then, function(s, x) {
        put(s, x + 1)
      })
      (then, function(s, x) {
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

    then(c, b)
    then(d, b)
    then(b, a)

    // c     d     e
    // |     |
    // |     v
    //  ---> b      
    //       |
    //       v
    //       a
    assert.deepEqual(a.sources, [b])
    assert.deepEqual(b.targets, [a])
    assert.deepEqual(b.sources, [c, d])
    assert.deepEqual(c.targets, [b])
    assert.deepEqual(d.targets, [b])

    reset(c)

    // c     d     e
    //       |
    //       v
    //       b      
    //       |
    //       v
    //       a
    assert.deepEqual(a.sources, [b])
    assert.deepEqual(b.targets, [a])
    assert.deepEqual(b.sources, [d])
    assert(!c.targets.length)
    assert.deepEqual(d.targets, [b])

    reset(d)

    // c     d     e
    //        
    //
    //       b   
    //     
    //     
    //       a
    assert(!a.sources.length)
    assert(!b.sources.length)
    assert(!b.targets.length)
    assert(!c.targets.length)
    assert(!d.targets.length)

    then(e, b)

    // c     d     e
    //             |
    //             |
    //       b <--- 
    //     
    //     
    //       a
    assert(!a.sources.length)
    assert(!b.targets.length)
    assert.deepEqual(b.sources, [e])
    assert(!c.targets.length)
    assert(!d.targets.length)
    assert.deepEqual(e.targets, [b])
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
    assert.deepEqual(b.sources, [a])
    assert.deepEqual(b.targets, [c, d])
    assert.deepEqual(c.sources, [b])
    assert.deepEqual(d.sources, [b])

    reset(c)

    //       a
    //       |
    //       v
    //       b      
    //       |
    //       v
    // c     d     e
    assert.deepEqual(a.targets, [b])
    assert.deepEqual(b.sources, [a])
    assert.deepEqual(b.targets, [d])
    assert.deepEqual(c.sources, [b])
    assert.deepEqual(d.sources, [b])

    reset(d)

    //       a
    //        
    //        
    //       b      
    //        
    //        
    // c     d     e
    assert(!a.targets.length)
    assert.deepEqual(b.sources, [a])
    assert(!b.targets.length)
    assert.deepEqual(c.sources, [b])
    assert.deepEqual(d.sources, [b])

    then(b, e)

    //       a
    //       |
    //       v
    //       b ----
    //             |
    //             v
    // c     d     e
    assert.deepEqual(a.targets, [b])
    assert.deepEqual(b.sources, [a])
    assert.deepEqual(b.targets, [e])
    assert.deepEqual(c.sources, [b])
    assert.deepEqual(d.sources, [b])
    assert.deepEqual(e.sources, [b])
  })

  it("should support error handling", function(done) {
    var s = sig()
    var e = new Error(':/')

    s.errorHandler = function(s, caughtErr) {
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

  it("should allow handlers of ending signals to rethrow errors", function() {
    var s = sig()

    s.errorHandler = function(s, e) {
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

    s1.errorHandler = function(s, caughtErr) {
      if (caughtErr.message != ':|') raise(s, caughtErr)
    }

    s3.errorHandler = function(s, caughtErr) {
      s3Err = caughtErr
    }

    s4.errorHandler = function(s, caughtErr) {
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

    t.errorHandler = function(t, caughtErr) {
      assert.strictEqual(caughtErr, e)
      done()
    }

    watch(t, s)
    put(s)
  })

  it("should support signal pausing and resuming", function() {
    var results = []
    var s = sig()
    var t = sig()
    var u = sig()
    u.receiver = function(u, x) { results.push(x) }

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
    var s = sig()
    var t = sig()
    var u = sig()

    s.eager = true
    t.eager = false

    assert(s.paused)
    assert(t.paused)

    then(s, u)
    assert(!s.paused)

    then(t, u)
    assert(t.paused)
  })

  it("should allow multiple source signals", function() {
    var results = []
    var s1 = sig()
    var s2 = sig()

    var t = sig()
    t.receiver = function(t, x) { results.push(x) }

    watch(t, s1)
    watch(t, s2)

    put(s1, 1)
    put(s2, 2)
    put(s1, 3)
    put(s2, 4)

    assert.deepEqual(results, [1, 2, 3, 4])
  })

  it("should allow multiple target signals", function() {
    var results1 = []
    var results2 = []
    var s = sig()

    var t1 = sig()
    t1.receiver = function(t1, x) { results1.push(x) }

    var t2 = sig()
    t2.receiver = function(t2, x) { results2.push(x) }

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
    var s1 = sig()
    var s2 = sig()

    var t = sig()
    t.receiver = function(x) { results.push(x) }

    then(s1, t)
    then(s2, t)
    reset(t)

    put(s1, 1)
    put(s2, 2)
    put(s1, 3)
    put(s2, 4)

    assert(!results.length)
  })

  it("should allow a source signal to be reset", function() {
    var results1 = []
    var results2 = []
    var s = sig()

    var t1 = sig()
    t1.receiver = function(t1, x) { results1.put(x) }

    var t2 = sig()
    t2.receiver = function(t2, x) { results2.put(x) }

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

  it("should allow a signal to stop watching another", function() {
    var results = []
    var s = sig()

    var t = sig()
    t.receiver = function(x) { results.push(x) }

    watch(t, s)
    unwatch(t, s)

    vv(s)
      (put, 1)
      (put, 2)
      (put, 3)
      (put, 4)

    assert(!results.length)
  })

  it("should prevent duplicate sources", function() {
    var s = sig()
    var t = sig()
    watch(t, s)
    watch(t, s)
    assert.equal(t.sources.length, 1)
  })

  it("should prevent duplicate targets", function() {
    var s = sig()
    var t = sig()
    watch(t, s)
    watch(t, s)
    assert.equal(s.targets.length, 1)
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

  describe(".except", function(done) {
    it("should create a signal that catches errors", function(done) {
      var s = sig()
      var e = new Error(':/')

      var t = except(s, function(t, caughtErr) {
        assert.strictEqual(caughtErr, e)
        done()
      })

      assert.notStrictEqual(t, s)
      raise(s, e)
    })
  })


  describe(".map", function() {
    it.skip("should map the given signal", function() {
      vv([1, 2, 3, 4])
        (sig)
        (map, function(x) { return x * 2 })
        (map, function(x) { return x + 1 })
        (capture)
        (assert.deepEqual, [3, 5, 7, 9])
    })

    it.skip("should allow additional args", function() {
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
    it.skip("should filter the given signal", function() {
      vv([2, 3, 4, 5, 6, 11, 12, 15, 16])
        (sig)
        (filter, function(x) { return x % 2 })
        (filter, function(x) { return x < 10 })
        (capture)
        (assert.deepEqual, [3, 5])
    })

    it.skip("should allow additional args", function() {
      function fn(a, b, c) {
        return (a * b) % c
      }

      vv([1, 2, 3, 4])
        (sig)
        (filter, fn, 3, 2)
        (capture)
        (assert.deepEqual, [1, 3])
    })
  })


  describe(".limit", function() {
    it.skip("should limit the given signal", function() {
      vv([1, 2, 3, 4, 5, 6])
        (sig)
        (limit, 3)
        (capture)
        (assert.deepEqual, [1, 2, 3])
    })
  })


  describe(".once", function() {
    it.skip("should limit a signal to its first output", function() {
      vv([1, 2, 3, 4, 5, 6])
        (sig)
        (once)
        (capture)
        (assert.deepEqual, [1])
    })
  })


  describe(".isSig", function() {
    it.skip("should determine whether something is a signal", function() {
      assert(!isSig(void 0))
      assert(!isSig(null))
      assert(!isSig({}))
      assert(isSig(sig()))
    })
  })


  describe(".spread", function() {
    it.skip("should spread an array out as a function's arguments", function() {
      vv([1, 2, 3])
        (spread(function(a, b, c) {
          return [a + 1, b + 1, c + 1]
        }))
        (spread(function(a, b, c) {
          return [a * 2, b * 2, c * 2]
        }))
        (assert.deepEqual, [4, 6, 8])
    })

    it.skip("should append additional args", function() {
      var fn = spread(function(a, b, c, d) {
        return [a, b, c, d]
      })

      assert.deepEqual(fn([1, 2], 3, 4), [1, 2, 3, 4])
    })
  })


  describe(".any", function() {
    it.skip("should support arrays with both signals and non-signals", function() {
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
    
    it.skip("should support objects with both signals and non-signals", function() {
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

    it.skip("should reset all its listeners when the out signal is reset", function() {
      var a = sig()
      var b = sig()
      var s = any([a, b])
      assert.equal(a.targets.length, 1)
      assert.equal(b.targets.length, 1)

      reset(s)
      assert(!a.targets.length)
      assert(!b.targets.length)
    })

    it.skip("should handle errors from its source signals", function() {
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

    it.skip("should support an up-front map function", function() {
      vv([1, 2].map(ensure))
        (any, function(v, i) {
          return [v + 1, i]
        })
        (capture)
        (assert.deepEqual, [[2, 0], [3, 1]])
    })

    it.skip("should support argument objects", function() {
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
    it.skip("should support arrays with only non signals", function() {
      vv([21, 22, 23])
       (all)
       (capture)
       (assert.deepEqual, [[21, 22, 23]])
    })

    it.skip("should support objects with only non signals", function() {
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

    it.skip("should support arrays with both signals and non-signals", function() {
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
    
    it.skip("should support objects with both signals and non-signals", function() {
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

    it.skip("should output copies of a given array", function() {
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

    it.skip("should output copies of a given object", function() {
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

    it.skip("should reset all its listeners when the out signal is reset", function() {
      var a = sig()
      var b = sig()
      var s = all([a, b])
      assert.equal(a.targets.length, 1)
      assert.equal(b.targets.length, 1)

      reset(s)
      assert(!a.targets.length)
      assert(!b.targets.length)
    })

    it.skip("should work with signals with non-empty buffers", function() {
      var a = sig()
      put(a, 1)

      var b = sig()
      put(b, 2)

      vv([a, b])
        (all)
        (capture)
        (assert.deepEqual, [[1, 2]])
    })

    it.skip("should handle errors from its source signals", function() {
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

    it.skip("should support an up-front map function", function() {
      vv([21, 22, 23])
        (all, function(values) {
          return values.concat(24)
        })
        (capture)
        (assert.deepEqual, [[21, 22, 23, 24]])
    })

    it.skip("should spread out arguments if an arguments object is given", function() {
      test(21, 22, 23)

      function test() {
        vv(arguments)
          (all, function(a, b, c) {
            return [a + 1, b + 1, c + 1]
          })
          (capture)
          (assert.deepEqual, [[22, 23, 24]])
      }
    })
  })


  describe(".ensure", function() {
    it.skip("should simply pass through existing signals", function() {
      vv([1, 2])
        (sig)
        (ensure)
        (capture)
        (assert.deepEqual, [1, 2])
    })

    it.skip("should create a singleton signal from non-signals", function() {
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
    it.skip("should hold onto the last value given to the signal", function() {
      var s = val(2)
      resume(s)

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
  })
})
