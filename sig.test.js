var sig = require('./sig'),
    assert = require('assert')


function sink(s, fn) {
  var values = []

  return s
    .then(function(x) { values.push(x) })
    .put(values)
}


function capture(s) {
  var result

  s.call(sink)
   .then(function(v) { result = v })

  return result
}


describe("sig", function() {
  it("should allow values to be sent through signals", function() {
    var src = sig()
    var results = []

    src
      .then(function(x) {
        if (x % 2) this.put(x)
      })
      .then(function(x) {
        this.put(x + 1)
      })
      .then(function(x) {
        results.push(x)
      })

    assert(!results.length)

    src.put(1)
    assert.deepEqual(results, [2])

    src.put(2)
    assert.deepEqual(results, [2])

    src.put(3)
    assert.deepEqual(results, [2, 4])
  })

  it("should support top-down signal resets", function() {
    var a = sig()
    var b = sig()
    var c = sig()
    var d = sig()
    var e = sig()

    a.then(b)
    b.then(c)
    b.then(d)
    //       a
    //       |
    //       v
    //  ---- b      
    // |     |
    // v     v
    // c     d     e
    assert.deepEqual(a._targets, [b])
    assert.strictEqual(b._source, a)
    assert.deepEqual(b._targets, [c, d])
    assert.strictEqual(c._source, b)
    assert.strictEqual(d._source, b)

    a.reset()

    //       a
    //        
    //        
    //       b      
    //        
    //        
    // c     d     e
    assert(!a._targets.length)
    assert.strictEqual(b._source, null)
    assert(!b._targets.length)
    assert.strictEqual(c._source, null)
    assert.strictEqual(d._source, null)

    b.then(e)

    //       a
    //        
    //        
    //       b ----
    //             |
    //             v
    // c     d     e
    assert(!a._targets.length)
    assert.strictEqual(b._source, null)
    assert.deepEqual(b._targets, [e])
    assert.strictEqual(c._source, null)
    assert.strictEqual(d._source, null)
    assert.strictEqual(e._source, b)
  })

  it("should support bottom-up signal resets", function() {
    var a = sig()
    var b = sig()
    var c = sig()
    var d = sig()
    var e = sig()

    a.then(b)
    b.then(c)
    b.then(d)

    //       a
    //       |
    //       v
    //  ---- b      
    // |     |
    // v     v
    // c     d     e
    assert(!a.disconnected)
    assert(!b.disconnected)
    assert.deepEqual(a._targets, [b])
    assert.deepEqual(b._source, a)
    assert.deepEqual(b._targets, [c, d])
    assert.deepEqual(c._source, b)
    assert.deepEqual(d._source, b)

    c.reset()

    //       a
    //       |
    //       v
    //       b      
    //       |
    //       v
    // c     d     e
    assert(!a.disconnected)
    assert(!b.disconnected)
    assert.deepEqual(a._targets, [b])
    assert.strictEqual(b._source, a)
    assert.deepEqual(b._targets, [d])
    assert.strictEqual(c._source, null)
    assert.deepEqual(d._source, b)

    d.reset()

    //       a
    //        
    //        
    //       b      
    //        
    //        
    // c     d     e
    assert(a.disconnected)
    assert(b.disconnected)
    assert(!a._targets.length)
    assert.deepEqual(b._source, a)
    assert(!b._targets.length)
    assert.strictEqual(c._source, null)
    assert.strictEqual(d._source, null)

    b.then(e)

    //       a
    //       |
    //       v
    //       b ----
    //             |
    //             v
    // c     d     e
    assert(!a.disconnected)
    assert(!b.disconnected)
    assert.deepEqual(a._targets, [b])
    assert.strictEqual(b._source, a)
    assert.deepEqual(b._targets, [e])
    assert.strictEqual(c._source, null)
    assert.strictEqual(d._source, null)
    assert.strictEqual(e._source, b)
  })

  it("should support error handling", function(done) {
    var s = sig()
    var e = new Error(':/')

    s.errorHandler = function(caughtErr) {
      assert.strictEqual(caughtErr, e)
      done()
    }

    s.raise(e)
  })

  it("should throw unhandled errors", function() {
    function thrower() {
      sig().raise(new Error('o_O'))
    }

    assert.throws(thrower, /o_O/)
  })

  it("should unset errors even if error handlers throw errors", function() {
    var s = sig()

    try { s.raise('o_O') }
    catch (e) {}

    assert.strictEqual(s.error, null)
  })

  it("should allow handlers of ending signals to rethrow errors", function() {
    var s = sig()

    s.errorHandler = function(e) {
      s.raise(new Error(e + '!'))
    }

    function thrower() {
      s.raise(new Error('o_O'))
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

    s1.then(s2)
    s2.then(s3)
    s2.then(s4)

    s1.errorHandler = function(caughtErr) {
      if (caughtErr.message != ':|') this.raise(caughtErr)
    }

    s3.errorHandler = function(caughtErr) {
      s3Err = caughtErr
    }

    s4.errorHandler = function(caughtErr) {
      s4Err = caughtErr
    }

    s1.raise(e1)
      .raise(e2)

    assert.strictEqual(s3Err, e1)
    assert.strictEqual(s4Err, e1)
  })

  it("should catch and raise errors raised in receivers", function(done) {
    var s = sig()
    var t = sig()
    var e = new Error('o_O')

    t.receiver = function() {
      t.raise(e)
    }

    t.errorHandler = function(caughtErr) {
      assert.strictEqual(caughtErr, e)
      done()
    }

    t.source(s)
    s.resolve()
  })

  it("should support signal pausing and resuming", function() {
    var results = []
    var s = sig()
    var t = sig()
    var u = sig()
    u.receiver = function(x) { results.push(x) }

    s.then(t)
     .then(u)

    s.pause()
    t.pause()

    s.put(1)
    assert(!results.length)

    s.resume()
    assert(!results.length)

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

  it("should not allow multiple source signals", function() {
    var t = sig()

    function addSource() {
      t.source(sig())
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

    s.then(t1)
    s.then(t2)

    s.put(1)
     .put(2)
     .put(3)
     .put(4)

    assert.deepEqual(results1, [1, 2, 3, 4])
    assert.deepEqual(results2, [1, 2, 3, 4])
  })

  it("should allow a target signal to be reset", function() {
    var results = []
    var s = sig()

    var t = sig()
    t.receiver = function(x) { results.push(x) }

    s.then(t)
    t.reset()

    s.put(1)
     .put(2)

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

    s.then(t1)
    s.then(t2)
    s.reset()

    s.put(1)
     .put(2)
     .put(3)
     .put(4)

    assert(!results1.length)
    assert(!results2.length)
  })

  it("should allow a signal to stop sourceing another", function() {
    var results = []
    var s = sig()

    var t = sig()
    t.receiver = function(x) { results.push(x) }

    t.source(s)
    t.unsource(s)

    s.put(1)
     .put(2)
     .put(3)
     .put(4)

    assert(!results.length)
  })

  it("should act as an indentity for existing signals", function() {
    var s = sig()
    assert.strictEqual(sig(s), s)
  })

  it("should create a signal from an array of values", function() {
    sig([23])
      .call(sink)
      .then(assert.deepEqual, [23])

    sig([1, 2, 3, 4])
      .call(sink)
      .then(assert.deepEqual, [1, 2, 3, 4])
  })


  describe("eager signals", function() {
    it("should resume when the first target is added", function() {
      var s = sig()
      s.eager = true

      assert(s.paused)

      var t = s.then(sig())
      assert(!s.paused)

      t.reset()
      s.pause()

      s.then(sig())
      assert(s.paused)
    })
  })


  describe(".then", function() {
    it("should support connecting to an existing target", function() {
      var s = sig()
      var t = sig()
      s.then(t)
      assert.deepEqual(s._targets, [t])
      assert.strictEqual(t._source, s)
    })

    it("should support creating and connecting to a new target", function() {
      var s = sig()
      var t = s.then(receiver)
      assert.deepEqual(s._targets, [t])
      assert.strictEqual(t._source, s)
      assert.strictEqual(t.receiver, receiver)
      function receiver() {}
    })

    it("should allow extra arguments to be given", function(done) {
      var s = sig()

      s.then(function(a, b, c) {
        assert.equal(a, 1)
        assert.equal(b, 2)
        assert.equal(c, 3)
        done()
      }, 2, 3)

      s.put(1)
    })
  })


  describe(".except", function(done) {
    it("should create a signal that catches errors", function(done) {
      var s = sig()
      var e = new Error(':/')

      var t = s.except(function(caughtErr) {
        assert.strictEqual(caughtErr, e)
        done()
      })

      assert.notStrictEqual(t, s)
      s.raise(e)
    })

    it("should support extra arguments", function(done) {
      var s = sig()

      s.except(function(caughtErr, a, b) {
        assert.strictEqual(a, 1)
        assert.strictEqual(b, 2)
        done()
      }, 1, 2)

      s.raise(new Error(':/'))
    })
  })


  describe(".setup", function() {
    it("should call the function immediately", function(done) {
      var s = sig()

      s.setup(function() {
        assert.strictEqual(this, s)
        done()
      })
    })

    it("should call the function when a signal is reconnected", function() {
      var s = sig()
      var run

      s.setup(function() {
        run = true
        assert.strictEqual(this, s)
      })

      run = false
      var t = s.then(sig())
      assert(!run)

      t.reset()
      assert(!run)

      s.then(sig())
      assert(run)
    })
  })


  describe(".teardown", function() {
    it("should call the function when a signal is reset", function() {
      var s = sig()
      var run = false

      s.teardown(function() {
        run = true
        assert.strictEqual(this, s)
      })

      assert(!run)
      s.reset()
      assert(run)
    })

    it("should call the function when a signal is disconnected", function() {
      var s = sig()
      var run = false

      s.teardown(function() {
        run = true
        assert.strictEqual(this, s)
      })

      var t = s.then(sig())
      assert(!run)

      t.reset()
      assert(run)
    })
  })

  
  describe(".map", function() {
    it("should map the given signal", function() {
      sig([1, 2, 3, 4])
        .map(function(x) { return x * 2 })
        .map(function(x) { return x + 1 })
        .call(sink)
        .then(assert.deepEqual, [3, 5, 7, 9])
    })

    it("should allow additional args", function() {
      function fn(a, b, c) {
        return [a, b, c]
      }

      sig([1, 2, 3, 4])
        .map(fn, 23, 32)
        .call(sink)
        .then(assert.deepEqual, [
          [1, 23, 32],
          [2, 23, 32],
          [3, 23, 32],
          [4, 23, 32]
        ])
    })
  })


  describe(".filter", function() {
    it("should filter the given signal", function() {
      sig([2, 3, 4, 5, 6, 11, 12, 15, 16])
        .filter(function(x) { return x % 2 })
        .filter(function(x) { return x < 10 })
        .call(sink)
        .then(assert.deepEqual, [3, 5])
    })

    it("should allow additional args", function() {
      function fn(a, b, c) {
        return (a * b) % c
      }

      sig([1, 2, 3, 4])
        .filter(fn, 3, 2)
        .call(sink)
        .then(assert.deepEqual, [1, 3])
    })

    it("should default to an identity function", function() {
      sig([1, 0, 3, null])
        .filter()
        .call(sink)
        .then(assert.deepEqual, [1, 3])
    })
  })


  describe(".flatten", function() {
    it("should flatten the given signal", function() {
      sig([1, [2, [3, [4, 5, [6, 7, 8, [9, [10]]]]]]])
        .flatten()
        .call(sink)
        .then(assert.deepEqual, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })
  })


  describe(".limit", function() {
    it("should limit the given signal", function() {
      sig([1, 2, 3, 4, 5, 6])
        .limit(3)
        .call(sink)
        .then(assert.deepEqual, [1, 2, 3])
    })
  })


  describe(".once", function() {
    it("should limit a signal to its first output", function() {
      sig([1, 2, 3, 4, 5, 6])
        .once()
        .call(sink)
        .then(assert.deepEqual, [1])
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
      var results = sig.spread([1, 2, 3], function(a, b, c) {
        return [a + 1, b + 1, c + 1]
      })

      assert.deepEqual(results, [2, 3, 4])
    })
  })


  describe(".any", function() {
    it("should support arrays with both signals and non-signals", function() {
      var a = sig()
      var b = sig()
      var results = capture(sig.any([a, b, 23]))

      assert(!results.length)

      a.put(1)
      assert.deepEqual(results, [[1, 0]])

      b.put(2)
      assert.deepEqual(results, [[1, 0], [2, 1]])

      a.put(3)
      assert.deepEqual(results, [[1, 0], [2, 1], [3, 0]])

      b.put(4)
      assert.deepEqual(results, [[1, 0], [2, 1], [3, 0], [4, 1]])
    })
    
    it("should support objects with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = capture(sig.any({
        a: a,
        b: b,
        c: 23
      }))

      assert(!results.length)

      a.put(1)
      assert.deepEqual(results, [[1, 'a']])

      b.put(2)
      assert.deepEqual(results, [[1, 'a'], [2, 'b']])

      a.put(3)
      assert.deepEqual(results, [[1, 'a'], [2, 'b'], [3, 'a']])

      b.put(4)
      assert.deepEqual(results, [[1, 'a'], [2, 'b'], [3, 'a'], [4, 'b']])
    })

    it("should reset all its listeners when the out signal is reset", function() {
      var a = sig()
      var b = sig()
      var s = sig.any([a, b])
      assert.equal(a._targets.length, 1)
      assert.equal(b._targets.length, 1)

      s.reset()
      assert(!a._targets.length)
      assert(!b._targets.length)
    })

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      sig.any([a, b])
        .except(function(e) {
          results.push(e.message)
        })

      a.raise(new Error(':/'))
      b.raise(new Error(':|'))
      a.raise(new Error('o_O'))
      b.raise(new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })

    it("should support argument objects", function() {
      function test() {
        sig.any(arguments)
          .call(sink)
          .then(assert.deepEqual, [[1, 0], [2, 1]])
      }

      test(sig.ensure(1), sig.ensure(2))
    })
  })


  describe(".all", function() {
    it("should support arrays with only non signals", function() {
      sig.all([21, 22, 23])
       .call(sink)
       .then(assert.deepEqual, [[21, 22, 23]])
    })

    it("should support objects with only non signals", function() {
      sig.all({
           a: 21,
           b: 22,
           c: 23
        })
        .call(sink)
        .then(assert.deepEqual, [{
            a: 21,
            b: 22,
            c: 23
        }])
    })

    it("should support arrays with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = capture(sig.all([a, b, 23]))
      assert(!results.length)

      a.put(1)
      assert(!results.length)

      b.put(2)
      assert.deepEqual(results, [[1, 2, 23]])

      a.put(3)
      assert.deepEqual(results, [[1, 2, 23], [3, 2, 23]])

      b.put(4)
      assert.deepEqual(results, [[1, 2, 23], [3, 2, 23], [3, 4, 23]])
    })
    
    it("should support objects with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = capture(sig.all({
        a: a,
        b: b,
        c: 23 
      }))

      assert(!results.length)

      a.put(1)

      assert(!results.length)

      b.put(2)

      assert.deepEqual(results, [{
        a: 1,
        b: 2,
        c: 23
      }])

      a.put(3)

      assert.deepEqual(results, [{
        a: 1,
        b: 2,
        c: 23
      }, {
        a: 3,
        b: 2,
        c: 23
      }])

      b.put(4)

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
      var results = capture(sig.all([a, 23]))

      a.put(1)
       .put(2)
       .put(3)

      assert.equal(results.length, 3)
      assert.notStrictEqual(results[0], results[1])
      assert.notStrictEqual(results[1], results[2])
      assert.notStrictEqual(results[2], results[0])
    })

    it("should output copies of a given object", function() {
      var a = sig()

      var results = capture(sig.all({
        a: a,
        b: 23
      }))

      a.put(1)
       .put(2)
       .put(3)

      assert.equal(results.length, 3)
      assert.notStrictEqual(results[0], results[1])
      assert.notStrictEqual(results[1], results[2])
      assert.notStrictEqual(results[2], results[0])
    })

    it("should reset all its listeners when the out signal is reset", function() {
      var a = sig()
      var b = sig()
      var s = sig.all([a, b])
      assert.equal(a._targets.length, 1)
      assert.equal(b._targets.length, 1)

      s.reset()
      assert(!a._targets.length)
      assert(!b._targets.length)
    })

    it("should work with signals with non-empty buffers", function() {
      var a = sig()
      a.put(1)

      var b = sig()
      b.put(2)

      sig.all([a, b])
        .call(sink)
        .then(assert.deepEqual, [[1, 2]])
    })

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      sig.all([a, b])
        .except(function(e) {
          results.push(e.message)
        })

      a.raise(new Error(':/'))
      b.raise(new Error(':|'))
      a.raise(new Error('o_O'))
      b.raise(new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })
  })


  describe(".merge", function() {
    it("should support arrays with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = capture(sig.merge([a, b, 23]))
      assert(!results.length)

      a.put(1)
      assert.deepEqual(results, [1])

      b.put(2)
      assert.deepEqual(results, [1, 2])

      a.put(3)
      assert.deepEqual(results, [1, 2, 3])

      b.put(4)
      assert.deepEqual(results, [1, 2, 3, 4])
    })
    
    it("should support objects with both signals and non-signals", function() {
      var a = sig()
      var b = sig()

      var results = capture(sig.merge({
        a: a,
        b: b,
        c: 23
      }))

      assert(!results.length)

      a.put(1)
      assert.deepEqual(results, [1])

      b.put(2)
      assert.deepEqual(results, [1, 2])

      a.put(3)
      assert.deepEqual(results, [1, 2, 3])

      b.put(4)
      assert.deepEqual(results, [1, 2, 3, 4])
    })

    it("should reset all its listeners when the out signal is reset", function() {
      var a = sig()
      var b = sig()
      var s = sig.merge([a, b])
      assert.equal(a._targets.length, 1)
      assert.equal(b._targets.length, 1)

      s.reset()
      assert(!a._targets.length)
      assert(!b._targets.length)
    })

    it("should handle errors from its source signals", function() {
      var results = []
      var a = sig()
      var b = sig()

      sig.merge([a, b])
        .except(function(e) {
          results.push(e.message)
        })

      a.raise(new Error(':/'))
      b.raise(new Error(':|'))
      a.raise(new Error('o_O'))
      b.raise(new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })

    it("should support argument objects", function() {
      function test() {
        sig.merge(arguments)
          .call(sink)
          .then(assert.deepEqual, [1, 2])
      }

      test(sig.ensure(1), sig.ensure(2))
    })
  })


  describe(".update", function() {
    it("should update the signal to use the last returned signal", function() {
      var s = sig()

      var results = s
        .update(function(u) {
          return u.map(function(x) { return x * 2 })
        })
        .call(capture)

      var t = sig()
      s.put(t)

      t.put(1)
       .put(2)
       .put(3)

      var u = sig()
      s.put(u)

      u.put(4)
       .put(5)
       .put(6)

      t.put(7)
       .put(8)
       .put(9)

      assert.deepEqual(results, [2, 4, 6, 8, 10, 12])
    })

    it("should support additional args", function() {
      var s = sig()

      var results = s
        .update(sig.map, function(x) { return x * 2 })
        .call(capture)

      var t = sig()
      s.put(t)

      t.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [2, 4, 6])
    })

    it("should default to an identity function", function() {
      var s = sig()

      var results = s
        .update()
        .call(capture)

      var t = sig()
      s.put(t)

      t.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should do nothing if a non-signal is returned", function() {
      var s = sig()

      var results = s
        .update(function(x) { if (x % 2) return sig.val(x) })
        .call(capture)

      s.put(1)
       .put(2)
       .put(3)
       .put(4)
       .put(5)

      assert.deepEqual(results, [1, 3, 5])
    })
  })


  describe(".append", function() {
    it("should append each returned signal", function() {
      var s = sig()

      var results = s
        .append(function(u) {
          return u.map(function(x) { return x * 2 })
        })
        .call(capture)

      var t = sig()
      s.put(t)

      t.put(1)
       .put(2)
       .put(3)

      var u = sig()
      s.put(u)

      u.put(4)
       .put(5)
       .put(6)

      t.put(7)
       .put(8)
       .put(9)

      assert.deepEqual(results, [2, 4, 6, 8, 10, 12, 14, 16, 18])
    })

    it("should support additional args", function() {
      var s = sig()
      var results = []

      var results = s
        .append(sig.map, function(x) { return x * 2 })
        .call(capture)

      var t = sig()
      s.put(t)

      t.put(1)
       .put(2)
       .put(3)

      var u = sig()
      s.put(u)

      u.put(4)
       .put(5)
       .put(6)

      assert.deepEqual(results, [2, 4, 6, 8, 10, 12])
    })

    it("should default to an identity function", function() {
      var s = sig()
      var results = capture(s.append())

      var t = sig()
      s.put(t)

      t.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should do nothing if a non-signal is returned", function() {
      var s = sig()

      var results = s
        .append(function(x) {
          if (x % 2) return sig.val(x)
        })
        .call(capture)

      s.put(1)
       .put(2)
       .put(3)
       .put(4)
       .put(5)

      assert.deepEqual(results, [1, 3, 5])
    })
  })


  describe(".ensure", function() {
    it("should simply pass through existing signals", function() {
      sig.ensure(sig([1, 2]))
        .call(sink)
        .then(assert.deepEqual, [1, 2])
    })

    it("should create a singleton signal from non-signals", function() {
      sig.ensure(23)
        .call(sink)
        .then(assert.deepEqual, [23])

      sig.ensure([[1, 2], [3, 4]])
        .call(sink)
        .then(assert.deepEqual, [[[1, 2], [3, 4]]])
    })
  })


  describe(".val", function() {
    it("should hold last value given to the signal", function() {
      var s = sig.val(2)
      var results = capture(s)
      assert.deepEqual(results, [2])

      s.put(3)
      assert.deepEqual(results, [2, 3])

      s.put(4)
      assert.deepEqual(results, [2, 3, 4])
    })

    it("should work for eager signals", function() {
      var s = sig.val(2)
      s.eager = true
      assert.deepEqual(s.call(capture), [2])
    })

    it("should work for non-eager signals", function() {
      var s = sig.val(2)
      s.eager = false
      s.resume()
      assert.deepEqual(s.call(capture), [2])
    })
  })


  describe(".ensureVal", function() {
    it("should turn values into sticky signals", function() {
      sig.ensureVal(23)
        .call(sink)
        .then(assert.deepEqual, [23])
    })

    it("should turn signals into sticky signals", function() {
      var s = sig.ensureVal(sig([23]))

      s.call(sink)
       .then(assert.deepEqual, [23])

      s.call(sink)
       .then(assert.deepEqual, [23])
    })
  })

  describe(".redir", function() {
    it("should redirect signal output", function() {
      var s = sig()
      var t = sig()
      var results = capture(t)

      s.redir(t)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should redirect signal errors", function(done) {
      var s = sig()
      var t = sig()
      var e = new Error(':/') 

      s.redir(t)

      t.except(function(nextE) {
        assert.strictEqual(e, nextE)
        done()
      })

      s.raise(e)
    })

    it("should not redirect after the target has been reset", function() {
      var s = sig()
      var t = sig()
      var results = capture(t)

      s.redir(t)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])

      t.reset()

      s.put(4)
       .put(5)
       .put(6)

      assert.deepEqual(results, [1, 2, 3])
    })
  })


  describe(".to", function() {
    it("should put the given value onto the given signal", function() {
      var s = sig()
      sig.to(1, s)
      sig.to(2, s)
      sig.to(3, s)
      assert.deepEqual(capture(s), [1, 2, 3])
    })
  })


  describe(".resolve", function() {
    it("should put nulls", function() {
      sig()
        .resolve()
        .resolve()
        .call(sink)
        .then(assert.deepEqual, [null, null])
    })
  })


  describe(".call", function() {
    it("should call a function with the signal", function(done) {
      var s = sig()
      s.call(fn, 23, 32)

      function fn(t, a, b) {
        assert.strictEqual(s, t)
        assert.equal(a, 23)
        assert.equal(b, 32)
        done()
      }
    })
  });


  describe(".method", function() {
    it("should curry the this context", function() {
      var meth = sig.method(function(a, b) {
        return a + b
      })

      assert.equal(meth.call(23, 32), 55)
    })
  })
})
