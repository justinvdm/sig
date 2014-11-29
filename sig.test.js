var assert = require('assert')
var sig = require('./sig')
var vv = require('drainpipe')


function capture(s) {
  var values = []

  sig.map(s, function(x) {
    values.push(x)
  })

  return values
}


function contains(arr, values) {
  return !!values.some(function(v) {
    return arr.indexOf(v) > -1
  })
}


describe("sig", function() {
  it("should support error handling", function(done) {
    var s = sig()
    var e = new Error(':/')

    s.errorHandler = function(caughtErr) {
      assert.strictEqual(caughtErr, e)
      done()
    }

    sig.raise(s, e)
  })

  it("should throw unhandled errors", function() {
    function thrower() {
      sig.raise(sig(), new Error('o_O'))
    }

    assert.throws(thrower, /o_O/)
  })

  it("should allow handlers of ending signals to rethrow errors", function() {
    var s = sig()

    s.errorHandler = function(e) {
      throw new Error(e + '!')
    }

    function thrower() {
      sig.raise(s, new Error('o_O'))
    }

    assert.throws(thrower, /o_O/)
  })

  it("should allow handlers of ending signals to rethrow errors", function() {
    var s = sig()

    s.errorHandler = function(e) {
      throw new Error(e + '!')
    }

    function thrower() {
      sig.raise(s, new Error('o_O'))
    }

    assert.throws(thrower, /o_O!/)
  })

  it("should allow errors to propogate", function() {
    var s1 = sig()
    var s2 = sig()
    var s3 = sig()
    var s4 = sig()
    var s3Err, s4Err

    var e1 = new Error(':|')
    var e2 = new Error('o_O')

    sig.watch(s2, s1)
    sig.watch(s3, s2)
    sig.watch(s4, s2)

    s1.errorHandler = function(caughtErr) {
      if (caughtErr != ':|') throw caughtErr
    }

    s3.errorHandler = function(caughtErr) {
      s3Err = caughtErr
    }

    s4.errorHandler = function(caughtErr) {
      s4Err = caughtErr
    }

    sig.raise(s1, e1)
    sig.raise(s1, e2)
    assert.strictEqual(s3Err, e2)
    assert.strictEqual(s4Err, e2)
  })

  it("should catch and raise errors thrown in receivers", function(done) {
    var s = sig(null)
    var t = sig()
    var e = new Error('o_O')

    t.receiver = function() {
      throw e
    }

    t.errorHandler = function(caughtErr) {
      assert.strictEqual(caughtErr, e)
      done()
    }

    sig.watch(t, s)
    sig.resume(s)
  })

  it("should support signal pausing and resuming", function() {
    var results = []
    var s = sig()

    var t = sig()
    t.receiver = function(x, t) { sig.put(t, x) }

    var u = sig()
    u.receiver = function(x) { results.push(x) }

    sig.watch(t, s)
    sig.watch(u, t)

    sig.put(s, 1)
    assert(!results.length)

    sig.resume(s)
    assert(!results.length)

    sig.resume(t)
    assert.deepEqual(results, [1])

    sig.put(s, 2)
    assert.deepEqual(results, [1, 2])

    sig.pause(t)
    sig.put(s, 3)
    assert.deepEqual(results, [1, 2])

    sig.resume(t)
    assert.deepEqual(results, [1, 2, 3])

    sig.pause(s)
    sig.put(s, 4)

    sig.resume(s)
    assert.deepEqual(results, [1, 2, 3, 4])
  })

  it("should allow multiple source signals", function() {
    var results = []
    var s1 = sig()
    var s2 = sig()

    var t = sig()
    t.receiver = function(x) { results.push(x) }

    sig.resume(t)
    sig.resume(s1)
    sig.resume(s2)

    sig.watch(t, s1)
    sig.watch(t, s2)

    sig.put(s1, 1)
    sig.put(s2, 2)
    sig.put(s1, 3)
    sig.put(s2, 4)

    assert.deepEqual(results, [1, 2, 3, 4])
  })

  it("should allow multiple target signals", function() {
    var results1 = []
    var results2 = []
    var s = sig()

    var t1 = sig()
    t1.receiver = function(x) { results1.push(x) }

    var t2 = sig()
    t2.receiver = function(x) { results2.push(x) }

    sig.resume(s)
    sig.resume(t1)
    sig.resume(t2)

    sig.watch(t1, s)
    sig.watch(t2, s)

    vv(s)
      (sig.put, 1)
      (sig.put, 2)
      (sig.put, 3)
      (sig.put, 4)

    assert.deepEqual(results1, [1, 2, 3, 4])
    assert.deepEqual(results2, [1, 2, 3, 4])
  })

  it("should allow a target signal to be reset", function() {
    var results = []
    var s1 = sig()
    var s2 = sig()

    var t = sig()
    t.receiver = function(x) { results.push(x) }

    sig.resume(s1)
    sig.resume(s2)
    sig.resume(t)

    sig.watch(t, s1)
    sig.watch(t, s2)
    sig.reset(t)

    sig.put(s1, 1)
    sig.put(s2, 2)
    sig.put(s1, 3)
    sig.put(s2, 4)

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

    sig.resume(s)
    sig.resume(t1)
    sig.resume(t2)

    sig.watch(t1, s)
    sig.watch(t2, s)
    sig.reset(s)

    vv(s)
      (sig.put, 1)
      (sig.put, 2)
      (sig.put, 3)
      (sig.put, 4)

    assert(!results1.length)
    assert(!results2.length)
  })

  it("should allow a signal to stop watching another", function() {
    var results = []
    var s = sig()

    var t = sig()
    t.receiver = function(x) { results.push(x) }

    sig.resume(s)
    sig.resume(t)

    sig.watch(t, s)
    sig.unwatch(t, s)

    vv(s)
      (sig.put, 1)
      (sig.put, 2)
      (sig.put, 3)
      (sig.put, 4)

    assert(!results.length)
  })

  it("should support signal dependencies", function() {
    var s = sig()
    var t = sig()
    var u = sig()
    var results = capture(u)

    sig.depend(t, s)
    sig.depend(u, t)

    vv(u)
      (sig.put, 1)
      (sig.put, 2)
      (sig.put, 3)

    assert.deepEqual(results, [1, 2, 3])

    sig.reset(s)

    vv(u)
      (sig.put, 4)
      (sig.put, 5)
      (sig.put, 6)

    assert.deepEqual(results, [1, 2, 3])
  })

  it("should allow signals to stop depending on other signals", function() {
    var s = sig()
    var t = sig()
    var u = sig()
    var results = capture(u)

    sig.depend(t, s)
    sig.depend(u, t)
    sig.undepend(u, t)
    sig.reset(s)

    vv(u)
      (sig.put, 1)
      (sig.put, 2)
      (sig.put, 3)

    assert.deepEqual(results, [1, 2, 3])
  })

  it("should prevent duplicate sources", function() {
    var s = sig()
    var t = sig()
    sig.watch(t, s)
    sig.watch(t, s)
    assert.equal(t.sources.length, 1)
  })

  it("should prevent duplicate targets", function() {
    var s = sig()
    var t = sig()
    sig.watch(t, s)
    sig.watch(t, s)
    assert.equal(s.targets.length, 1)
  })

  it("should prevent duplicate dependencies", function() {
    var s = sig()
    var t = sig()
    sig.depend(t, s)
    sig.depend(t, s)
    assert.equal(s.dependants.length, 1)
  })

  it("should act as an identity for existing signals", function() {
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
      (sig.cleanup, function() {
        results.push(1)
      })
      (sig.cleanup, function() {
        results.push(2)
      })
      (sig.cleanup, function() {
        results.push(3)
      })
      ()

    assert(!results.length)
    sig.reset(s)
    assert.deepEqual(results, [1, 2, 3])
  })

  describe("generators", function() {
    it("should make the scoped signals depend on the returned signal", function() {
      var innerA
      var innerB
      var innerC

      sig()
      sig()
      sig()

      var s = sig(function() {
        var s = sig()
        innerA = sig()
        innerB = sig()
        innerC = sig()
        return s
      })

      assert(contains(s.dependants, [innerA, innerB, innerC]))
    })

    it("should support nested generators", function() {
      var a, b, c, a1, a2, b1, b2, c1, c2

      a = sig(function() {
        a1 = sig()
        a2 = sig()

        b = sig(function() {
          b1 = sig()
          b2 = sig()

          c = sig(function() {
            c1 = sig()
            c2 = sig()

            return sig()
          })

          return sig()
        })

        return sig()
      })

      assert(contains(a.dependants, [b]))
      assert(contains(a.dependants, [a1, a2]))
      assert(!contains(a.dependants, [b1, b2]))
      assert(!contains(a.dependants, [c1, c2]))
      assert(!contains(a.dependants, [c]))

      assert(contains(b.dependants, [c]))
      assert(contains(b.dependants, [b1, b2]))
      assert(!contains(b.dependants, [a1, a2]))
      assert(!contains(b.dependants, [c1, c2]))
      assert(!contains(b.dependants, [a]))

      assert(contains(c.dependants, [c1, c2]))
      assert(!contains(c.dependants, [a1, a2]))
      assert(!contains(c.dependants, [b1, b2]))
      assert(!contains(c.dependants, [a, b]))
    })

    it("should redirect unhandled errors to the returned signal", function() {
      var outer = sig()
      var results = []

      vv(function() {
          var s = sig()

          sig.map(outer, function(i) {
            if (i % 2) throw new Error('o_O')
          })

          sig.map(outer, function(i) {
            if (i % 2) return
            throw new Error(':/')
          })

          return s
        })
        (sig)
        (sig.except, function(e) {
          results.push(e.message)
        })

      vv(outer)
        (sig.put, 1)
        (sig.put, 2)
        (sig.put, 3)
        (sig.put, 4)

      assert.deepEqual(results, ['o_O', ':/', 'o_O', ':/'])
    })
  })


  describe(".except", function(done) {
    it("should create a signal that catches a given signals errors", function(done) {
      var s = sig()
      var e = new Error(':/')

      var t = sig.except(s, function(caughtErr) {
        assert.strictEqual(caughtErr, e)
        done()
      })

      assert.notStrictEqual(t, s)
      sig.raise(s, e)
    })
  })


  describe(".map", function() {
    it("should map the given signal", function() {
      vv([1, 2, 3, 4])
        (sig)
        (sig.map, function(x) { return x * 2 })
        (sig.map, function(x) { return x + 1 })
        (capture)
        (assert.deepEqual, [3, 5, 7, 9])
    })

    it("should allow additional args", function() {
      function fn(a, b, c) {
        return [a, b, c]
      }

      vv([1, 2, 3, 4])
        (sig)
        (sig.map, fn, 23, 32)
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
        (sig.filter, function(x) { return x % 2 })
        (sig.filter, function(x) { return x < 10 })
        (capture)
        (assert.deepEqual, [3, 5])
    })

    it("should allow additional args", function() {
      function fn(a, b, c) {
        return (a * b) % c
      }

      vv([1, 2, 3, 4])
        (sig)
        (sig.filter, fn, 3, 2)
        (capture)
        (assert.deepEqual, [1, 3])
    })
  })


  describe(".limit", function() {
    it("should limit the given signal", function() {
      vv([1, 2, 3, 4, 5, 6])
        (sig)
        (sig.limit, 3)
        (capture)
        (assert.deepEqual, [1, 2, 3])
    })
  })


  describe(".once", function() {
    it("should limit a signal to its first output", function() {
      vv([1, 2, 3, 4, 5, 6])
        (sig)
        (sig.once)
        (capture)
        (assert.deepEqual, [1])
    })
  })


  describe(".then", function() {
    it("should only map a signal's first output", function() {
      vv([1, 2, 3, 4])
        (sig)
        (sig.then, function(x) {
          return x + 1
        })
        (capture)
        (assert.deepEqual, [2])
    })

    it("should allow additional args", function() {
      function fn(a, b, c) {
        return [a, b, c]
      }

      vv([1, 2, 3, 4])
        (sig)
        (sig.then, fn, 23, 32)
        (capture)
        (assert.deepEqual, [[1, 23, 32]])
    })
  })


  describe(".isSig", function() {
    it("should determine whether something is a signal", function() {
      assert(!sig.isSig(void 0))
      assert(!sig.isSig(null))
      assert(!sig.isSig({}))
      assert(sig.isSig(sig()))
    })
  })


  describe(".spread", function() {
    it("should spread an array out as a function's arguments", function() {
      vv([1, 2, 3])
        (sig.spread(function(a, b, c) {
          return [a + 1, b + 1, c + 1]
        }))
        (sig.spread(function(a, b, c) {
          return [a * 2, b * 2, c * 2]
        }))
        (assert.deepEqual, [4, 6, 8])
    })

    it("should append additional args", function() {
      var fn = sig.spread(function(a, b, c, d) {
        return [a, b, c, d]
      })

      assert.deepEqual(fn([1, 2], 3, 4), [1, 2, 3, 4])
    })
  })


  describe(".any", function() {
    it("should support arrays with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = vv([a, b, 23])
        (sig.any)
        (capture)
        ()

      assert(!results.length)

      sig.put(a, 1)
      assert.deepEqual(results, [[1, 0]])

      sig.put(b, 2)
      assert.deepEqual(results, [[1, 0], [2, 1]])

      sig.put(a, 3)
      assert.deepEqual(results, [[1, 0], [2, 1], [3, 0]])

      sig.put(b, 4)
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
        (sig.any)
        (capture)
        ()

      assert(!results.length)

      sig.put(a, 1)
      assert.deepEqual(results, [[1, 'a']])

      sig.put(b, 2)
      assert.deepEqual(results, [[1, 'a'], [2, 'b']])

      sig.put(a, 3)
      assert.deepEqual(results, [[1, 'a'], [2, 'b'], [3, 'a']])

      sig.put(b, 4)
      assert.deepEqual(results, [[1, 'a'], [2, 'b'], [3, 'a'], [4, 'b']])
    })

    it("should reset all its listeners when the out signal is reset", function() {
      var a = sig()
      var b = sig()
      var s = sig.any([a, b])
      assert.equal(a.targets.length, 1)
      assert.equal(b.targets.length, 1)

      sig.reset(s)
      assert(!a.targets.length)
      assert(!b.targets.length)
    })

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      vv([a, b])
        (sig.any)
        (sig.except, function(e) {
          results.push(e.message)
        })

      sig.raise(a, new Error(':/'))
      sig.raise(b, new Error(':|'))
      sig.raise(a, new Error('o_O'))
      sig.raise(b, new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })
  })


  describe(".all", function() {
    it("should support arrays with only non signals", function() {
      vv([21, 22, 23])
       (sig.all)
       (capture)
       (assert.deepEqual, [[21, 22, 23]])
    })

    it("should support objects with only non signals", function() {
      vv({
         a: 21,
         b: 22,
         c: 23
        })
        (sig.all)
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
        (sig.all)
        (capture)
        ()

      assert(!results.length)

      sig.put(a, 1)
      assert(!results.length)

      sig.put(b, 2)
      assert.deepEqual(results, [[1, 2, 23]])

      sig.put(a, 3)
      assert.deepEqual(results, [[1, 2, 23], [3, 2, 23]])

      sig.put(b, 4)
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
        (sig.all)
        (capture)
        ()

      assert(!results.length)

      sig.put(a, 1)

      assert(!results.length)

      sig.put(b, 2)

      assert.deepEqual(results, [{
        a: 1,
        b: 2,
        c: 23
      }])

      sig.put(a, 3)

      assert.deepEqual(results, [{
        a: 1,
        b: 2,
        c: 23
      }, {
        a: 3,
        b: 2,
        c: 23
      }])

      sig.put(b, 4)

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
        (sig.all)
        (capture)
        ()

      sig.put(a, 1)
      sig.put(a, 2)
      sig.put(a, 3)

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
        (sig.all)
        (capture)
        ()

      sig.put(a, 1)
      sig.put(a, 2)
      sig.put(a, 3)

      assert.equal(results.length, 3)
      assert.notStrictEqual(results[0], results[1])
      assert.notStrictEqual(results[1], results[2])
      assert.notStrictEqual(results[2], results[0])
    })

    it("should reset all its listeners when the out signal is reset", function() {
      var a = sig()
      var b = sig()
      var s = sig.all([a, b])
      assert.equal(a.targets.length, 1)
      assert.equal(b.targets.length, 1)

      sig.reset(s)
      assert(!a.targets.length)
      assert(!b.targets.length)
    })

    it("should work with signals with non-empty buffers", function() {
      var a = sig()
      sig.put(a, 1)

      var b = sig()
      sig.put(b, 2)

      vv([a, b])
        (sig.all)
        (capture)
        (assert.deepEqual, [[1, 2]])
    })

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      vv([a, b])
        (sig.all)
        (sig.except, function(e) {
          results.push(e.message)
        })

      sig.raise(a, new Error(':/'))
      sig.raise(b, new Error(':|'))
      sig.raise(a, new Error('o_O'))
      sig.raise(b, new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })
  })


  describe(".ensure", function() {
    it("should simply pass through existing signals", function() {
      vv([1, 2])
        (sig)
        (sig.ensure)
        (capture)
        (assert.deepEqual, [1, 2])
    })

    it("should create a singleton signal from non-signals", function() {
      vv(23)
        (sig.ensure)
        (capture)
        (assert.deepEqual, [23])

      vv([[1, 2], [3, 4]])
        (sig.ensure)
        (capture)
        (assert.deepEqual, [[[1, 2], [3, 4]]])
    })
  })


  describe(".val", function() {
    it("should hold onto the last value given to the signal", function() {
      var s = sig.val(2)
      sig.resume(s)

      var c1 = capture(s)
      assert.deepEqual(c1, [2])

      sig.put(s, 3)
      var c2 = capture(s)
      assert.deepEqual(c1, [2, 3])
      assert.deepEqual(c2, [3])

      sig.put(s, 4)
      var c3 = capture(s)
      assert.deepEqual(c1, [2, 3, 4])
      assert.deepEqual(c2, [3, 4])
      assert.deepEqual(c3, [4])
    })
  })


  describe(".resolve", function() {
    it("should put a single null value onto a signal", function() {
      vv(sig())
        (sig.resolve)
        (capture)
        (assert.deepEqual, [null])
    })
  })
})
