var sig = require('./sig'),
    assert = require('assert'),
    EventEmitter = require('events').EventEmitter


function capture(s) {
  var results = []

  s.each(function(v) { results.push(v) })
   .done()

  return results
}


function sink(s, fn) {
  var results = []
  fn = sig.prime(sig.slice(arguments, 2), fn)

  return s
   .each(function(v) {
     results.push(v)
   })
   .teardown(function() {
     fn(results)
   })
}


function captureErrors(s) {
  return s
    .catch(function(e) { this.put(e.message).next() })
    .call(capture)
}


function counter(s) {
  var i = 0

  s.each(function() { i++ })
   .done()

  return function() { return i }
}


describe("sig", function() {
  it("should allow values to be sent through signals", function() {
    var src = sig()
    var results = []

    src
      .then(function(x) {
        if (x % 2) this.put(x)
        this.next()
      })
      .then(function(x) {
        this.put(x + 1).next()
      })
      .then(function(x) {
        results.push(x)
        this.next()
      })
      .done()

    assert(!results.length)

    src.put(1)
    assert.deepEqual(results, [2])

    src.put(2)
    assert.deepEqual(results, [2])

    src.put(3)
    assert.deepEqual(results, [2, 4])
  })

  it("should not allow multiple source signals", function() {
    var t = sig()
 
    function addSource() {
      sig().then(t).done()
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
    var t2 = sig()

    t1.handlers.value = function(x) {
      results1.push(x)
      this.next()
    }

    t2.handlers.value = function(x) {
      results2.push(x)
      this.next()
    }

    s.then(t1).done()
    s.then(t2).done()

    s.putEach([1, 2, 3, 4])
    assert.deepEqual(results1, [1, 2, 3, 4])
    assert.deepEqual(results2, [1, 2, 3, 4])
  })

  describe("adapters", function() {
    var _adapters_ = sig._adapters_

    beforeEach(function() {
      sig._adapters_ = sig.slice(_adapters_)
    })

    after(function() {
      sig._adapters_ = _adapters_
    })

    it("should support creating a signal from no arguments", function() {
      assert(sig.isSig(sig()))
    })

    it("should support creating a signal from a value handling fn", function() {
      var s = sig([21, 22, 23])
      var t = s.then(sig(fn, 1, 2))
      assert.deepEqual(capture(t), [24, 25, 26])

      function fn(a, b, c) {
        this.put(a + b + c).next()
      }
    })

    it("should act as an identity function for existing signals", function() {
      var s = sig()
      assert.strictEqual(s, sig(s))
    })

    it("should allow initial values to be given", function() {
      assert.deepEqual(capture(sig([1, 2, 3])), [1, 2, 3])
    })

    it("should support adding custom adapters", function() {
      sig.adapts(test, adapt)
      var ee = new EventEmitter()
      var results = capture(sig(ee, 'foo'))

      assert(!results.length)
      ee.emit('foo', 21)
      ee.emit('foo', 22)
      ee.emit('foo', 23)
      assert.deepEqual(results, [21, 22, 23])

      function test(obj) {
        return obj instanceof EventEmitter
      }

      function adapt(obj, eventName) {
        var s = sig()
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

    it("should throw an error if the arguments cannot be adapted", function() {
      sig._adapters_ = []

      assert.throws(
          function() { sig(21, 22, 23) },
          /No sig adapter found for arguments: 21, 22, 23/)
    })
  })

  describe("pausing and resuming", function() {
    it("should support signal pausing and resuming", function() {
      var results = []
      var s = sig()
      var t = sig()
      var u = sig()
    
      u.handlers.value = function(v) {
        results.push(v)
        this.next()
      }
    
      s.then(t)
       .then(u)
       .done()
    
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
  })

  describe("ending", function() {
    it("should mark the signal as ended", function() {
      var s = sig()
      assert(!s.ended)
      s.end()
      assert(s.ended)
    })

    it("should clear the signal's state", function() {
      var a = sig()
      var b = a.then(function(v){ this.put(v) })
      var c = b.then(sig())
      c.done()

      b.pause()

      a.put(21)
       .put(23)

      assert.strictEqual(b.source, a)
      assert.deepEqual(b.targets, [c])
      assert(b.inBuffer.length)
      assert(b.outBuffer.length)
      assert(!a.ending)

      b.resume().end()
      assert.strictEqual(b.source, null)
      assert(!b.targets.length)
      assert(!b.inBuffer.length)
      assert(!b.outBuffer.length)
      assert(!a.ending)
    })

    it("should end its targets", function() {
      var a = sig()
      var b = a.then(sig()).done()
      var c = b.then(sig()).done()
      var d = b.then(sig()).done()

      assert(!a.ended)
      assert(!b.ended)
      assert(!c.ended)
      assert(!d.ended)

      a.end()
      assert(a.ended)
      assert(b.ended)
      assert(c.ended)
      assert(d.ended)
    })

    it("should disconnect the signal", function() {
      var a = sig()
      var b = sig()
      var c = sig()
      var d = sig()
      var e = sig()

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
      assert(!a.disconnected)
      assert(!b.disconnected)
      assert(!c.disconnected)
      assert(!d.disconnected)
      assert.deepEqual(a.targets, [b])
      assert.deepEqual(b.source, a)
      assert.deepEqual(b.targets, [c, d])
      assert.deepEqual(c.source, b)
      assert.strictEqual(d.source, b)

      c.end()
      //       a
      //       |
      //       v
      //       b      
      //       |
      //       v
      // c     d     e
      assert(!a.disconnected)
      assert(!b.disconnected)
      assert(c.disconnected)
      assert(!d.disconnected)
      assert.deepEqual(a.targets, [b])
      assert.strictEqual(b.source, a)
      assert.deepEqual(b.targets, [d])
      assert.strictEqual(c.source, null)
      assert.strictEqual(d.source, b)

      d.end()
      //       a
      //        
      //        
      //       b      
      //        
      //        
      // c     d     e
      assert(a.disconnected)
      assert(b.disconnected)
      assert(c.disconnected)
      assert(d.disconnected)
      assert(!a.targets.length)
      assert.strictEqual(b.source, a)
      assert(!b.targets.length)
      assert.strictEqual(c.source, null)
      assert.strictEqual(d.source, null)

      b.then(e).done()
      //       a
      //       |
      //       v
      //       b ----
      //             |
      //             v
      // c     d     e
      assert(!a.disconnected)
      assert(!b.disconnected)
      assert(c.disconnected)
      assert(d.disconnected)
      assert.deepEqual(a.targets, [b])
      assert.strictEqual(b.source, a)
      assert.deepEqual(b.targets, [e])
      assert.strictEqual(c.source, null)
      assert.strictEqual(d.source, null)
      assert.strictEqual(e.source, b)
    })

    it("should delay signal ending until the buffer is clear", function() {
      var s = sig([1, 2, 3]).end()
      assert(!s.ended)
      assert(s.ending)
      s.each(function(){}).done()
      assert(s.ended)
      assert(!s.ending)
    })

    it("should not allow values to propagate from dead signals", function() {
      var a = sig()
      var b = sig()
      var c = sig()
      var results = capture(b)

      a.targets = [b]
      a.resume().put(21)
      assert.deepEqual(results, [21])

      a.end()
      results = capture(c)
      a.targets = [c]
      a.put(23)
      assert(!results.length)
    })

    it("should rethrow errors thrown from dead signals", function() {
      var a = sig().resume()
      var e = new Error('o_O')
      assert.doesNotThrow(thrower)
      a.end()
      assert.throws(thrower, /o_O/)

      function thrower() {
        a.throw(e)
      }
    })

    it("should not allow targets to be added to dead signals", function() {
      var a = sig().end()
      var b = a.then(sig())
      var c = a.then(function(){})
      b.done()
      c.done()
      assert(!a.targets.length)
      assert.strictEqual(b.source, null)
      assert.strictEqual(c.source, null)
    })

    it("should not allow dead signals to be re-ended", function() {
      var s = sig()
      var ends = s.event('end').call(counter)

      s.end()
       .end()
       .end()

      assert.strictEqual(ends(), 1)
    })

    it("should not allow ending signals to be re-ended", function() {
      var s = sig()
      var endings = s.event('ending').call(counter)

      s.end()
       .end()
       .end()

      assert.strictEqual(endings(), 1)
    })

    it("should not allow dead signals to be re-killed", function() {
      var s = sig()
      var ends = s.event('end').call(counter)

      s.end()
       .kill()
       .kill()

      assert.strictEqual(ends(), 1)
    })

    it("should allow ending signals to be killed", function() {
      var s = sig([23]).end()
      assert(s.ending)
      assert(!s.ended)
      s.kill()
      assert(s.ended)
    })

    it("should support forced ends", function() {
      var s = sig([1, 2, 3]).end()
      assert(!s.ended)
      s.kill()
      assert(s.ended)
    })
  })


  describe("error handling", function() {
    it("should support error handling", function() {
      var s = sig()
      var t = s.then(sig())
      var results = capture(t)
      var e1 = new Error(':/')
      var e2 = new Error('o_O')

      t.handlers.error = function(e) {
        this.put(e).next()
      }

      assert(!results.length)

      s.throw(e1)
      assert.equal(results.length, 1)
      assert.strictEqual(results[0], e1)

      s.throw(e2)
      assert.equal(results.length, 2)
      assert.strictEqual(results[0], e1)
      assert.strictEqual(results[1], e2)
    })

    it("should allow errors to propagate", function() {
      var s1 = sig()
      var s2 = sig()
      var s3 = sig()
      var s4 = sig()
      var s3Err, s4Err

      var e1 = new Error('o_O')
      var e2 = new Error(':|')

      s1.then(s2)
      s2.then(s3).done()
      s2.then(s4).done()

      s2.handlers.error = function(caughtErr) {
        if (caughtErr.message != ':|') this.throw(caughtErr)
      }

      s3.handlers.error = function(caughtErr) {
        s3Err = caughtErr
      }

      s4.handlers.error = function(caughtErr) {
        s4Err = caughtErr
      }

      s1.throw(e1)
        .throw(e2)

      assert.strictEqual(s3Err, e1)
      assert.strictEqual(s4Err, e1)
    })

    it("should handle errors thrown in value handlers", function(done) {
      var s = sig()
      var t = s.then(sig())
      var u = t.then(sig()).done()
      var e = new Error('o_O')

      t.handlers.value = function() {
        this.throw(e)
      }

      u.handlers.error = function(caughtErr) {
        assert.strictEqual(caughtErr, e)
        done()
      }

      s.put()
    })

    it("should handle errors thrown in error handlers", function(done) {
      var s = sig()
      var t = s.then(sig())
      var u = t.then(sig()).done()
      var e = new Error('o_O')

      t.handlers.error = function() {
        this.throw(e)
      }

      u.handlers.error = function(caughtErr) {
        assert.strictEqual(caughtErr, e)
        done()
      }

      s.throw(new Error(':/'))
    })
  })


  describe(".then", function() {
    it("should support connecting to an existing target", function() {
      var s = sig()
      var t = sig()
      s.then(t)
      assert.deepEqual(s.targets, [t])
      assert.strictEqual(t.source, s)
    })

    it("should support creating and connecting to a new target", function() {
      var s = sig()
      var t = s.then(handler)
      assert.deepEqual(s.targets, [t])
      assert.strictEqual(t.source, s)
      assert.strictEqual(t.handlers.value, handler)
      function handler() {}
    })

    it("should allow extra arguments to be given", function(done) {
      var s = sig()

      s.then(fn, 2, 3)
       .done(done)

      s.put(1)
       .end()

      function fn(a, b, c) {
        assert.equal(a, 1)
        assert.equal(b, 2)
        assert.equal(c, 3)
        this.next()
      }
    })
  })


  describe(".catch", function(done) {
    it("should create a signal that catches errors", function(done) {
      var s = sig()
      var e = new Error(':/')

      var t = s
        .catch(fn)
        .done(done)

      assert.notStrictEqual(t, s)

      s.throw(e)
       .end()

       function fn(caughtErr) {
         assert.strictEqual(caughtErr, e)
         this.next()
       }
    })

    it("should support extra arguments", function(done) {
      var s = sig()

      s.catch(fn, 1, 2)
       .done(done)

      s.throw(new Error(':/'))
       .end()

      function fn(caughtErr, a, b) {
        assert.strictEqual(a, 1)
        assert.strictEqual(b, 2)
        this.next()
      }
    })
  })


  describe(".done", function() {
    it("should start the signal chain", function() {
      var s = sig()
      var t = s.then(sig())
      assert(!s.started)
      assert(!t.started)
      t.done()
      assert(s.started)
      assert(t.started)
    })

    it("should callback when the signal ends", function() {
      var s = sig()
      var calls = 0
      s.done(function() { calls++ })

      assert.strictEqual(calls, 0)
      s.end()
      assert.strictEqual(calls, 1)
    })

    it("should errback when the signal encounters an error", function() {
      var s = sig()
      var calls = 0
      var err1 = new Error(':/')
      var err2

      s.done(function(err) {
        calls++
        err2 = err
      })

      assert.strictEqual(calls, 0)
      s.throw(err1)
      assert.strictEqual(calls, 1)
      assert.strictEqual(err1, err2)
    })

    it("should allow no callback to be given", function(done) {
      var s = sig()

      s.done()
       .teardown(done)

      s.end()
    })

    it("should rethrow errors if no callback is given", function() {
      var s = sig()
      s.done()
      assert.throws(thrower, /o_O/)

      function thrower() {
        s.throw(new Error('o_O'))
      }
    })

    it("should kill on an error if a callback is given", function() {
      var s = sig([1,2,3])
      s.done(function(){})

      assert(!s.ended)
      s.throw(':/')
      assert(s.ended)
    })

    it("should kill on an error if no callback is given", function() {
      var s = sig([1,2,3])
      s.done(function(){})

      assert(!s.ended)
      try { s.throw(':/') }
      catch (err) {}
      assert(s.ended)
    })

    it("should discard values", function() {
      var results = sig([1, 2, 3])
        .done()
        .call(capture)

      assert(!results.length)
    })
  })


  describe(".teardown", function() {
    it("should call the function when a signal is ended", function() {
      var s = sig()
      var run = false

      s.teardown(function() {
        run = true
        assert.strictEqual(this, s)
      })

      assert(!run)
      s.end()
      assert(run)
    })

    it("should get called immediately if the signal is dead", function() {
      var s = sig().end()
      var run = false

      s.teardown(function() {
        run = true
        assert.strictEqual(this, s)
      })

      assert(run)
    })
  })


  describe(".each", function() {
    it("should process each value given by the signal", function(done) {
      var s = sig()

      s.each(function(x) { this.put(x * 2) })
       .each(function(x) { this.put(x + 1) })
       .call(sink, assert.deepEqual, [3, 5, 7, 9])
       .done(done)

      s.putEach([1, 2, 3, 4])
       .end()
    })

    it("should allow additional args", function(done) {
      function fn(a, b, c) {
        this.put([a, b, c])
      }

      var s = sig()

      s.each(fn, 23, 32)
       .call(sink, assert.deepEqual, [
          [1, 23, 32],
          [2, 23, 32],
          [3, 23, 32],
          [4, 23, 32]
        ])
        .done(done)

      s.putEach([1, 2, 3, 4])
       .end()
    })

    it("should propagate natively thrown errors", function() {
      var results = sig(['o_O', '-_-', ':/'])
        .each(function(v) { throw new Error(v) })
        .catch(function(e) { this.put(e.message).next() })
        .call(capture)

      assert.deepEqual(results, ['o_O', '-_-', ':/'])
    })
  })

  
  describe(".map", function() {
    it("should map the given signal", function(done) {
      var s = sig()

      s.map(function(x) { return x * 2 })
       .map(function(x) { return x + 1 })
       .call(sink, assert.deepEqual, [3, 5, 7, 9])
       .done(done)

      s.putEach([1, 2, 3, 4])
       .end()
    })

    it("should allow non-function values to be given", function(done) {
      var s = sig()

      s.map(23)
       .call(sink, assert.deepEqual, [23, 23, 23, 23])
       .done(done)

      s.putEach([1, 2, 3, 4])
       .end()
    })

    it("should allow additional args", function(done) {
      function fn(a, b, c) {
        return [a, b, c]
      }

      var s = sig()

      s.map(fn, 23, 32)
       .call(sink, assert.deepEqual, [
         [1, 23, 32],
         [2, 23, 32],
         [3, 23, 32],
         [4, 23, 32]
       ])
       .done(done)

      s.putEach([1, 2, 3, 4])
       .end()
    })
  })


  describe(".filter", function() {
    it("should filter the given signal", function(done) {
      var s = sig()

      s.filter(function(x) { return x % 2 })
       .filter(function(x) { return x < 10 })
       .call(sink, assert.deepEqual, [3, 5])
       .done(done)

      s.putEach([2, 3, 4, 5, 6, 11, 12, 15, 16])
       .end()
    })

    it("should allow additional args", function(done) {
      var s = sig()

      s.filter(fn, 3, 2)
       .call(sink, assert.deepEqual, [1, 3])
       .done(done)

      s.putEach([1, 2, 3, 4])
       .end()

      function fn(a, b, c) {
        return (a * b) % c
      }
    })

    it("should default to an identity function", function(done) {
      var s = sig()

      s.filter()
       .call(sink, assert.deepEqual, [1, 3])
       .done(done)

      s.putEach([1, 0, 3, null])
       .end()
    })
  })


  describe(".flatten", function() {
    it("should flatten the given signal", function(done) {
      var s = sig()

      s.flatten()
       .limit(10)
       .call(sink, assert.deepEqual, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
       .done(done)

      s.putEach([1, [2, [3, [4, 5, [6, 7, 8, [9, [10]]]]]]])
       .end()
    })
  })


  describe(".limit", function() {
    it("should limit the given signal", function(done) {
      var s = sig()

      s.limit(3)
       .call(sink, assert.deepEqual, [1, 2, 3])
       .done(done)

      s.putEach([1, 2, 3, 4, 5, 6])
       .end()
    })

    it("should end the signal chain once the limit is reached", function() {
      var s = sig()
      s.limit(3).then(sig()).done()

      assert(!s.disconnected)

      s.put(1)
      assert(!s.disconnected)

      s.put(2)
      assert(!s.disconnected)

      s.put(3)
      assert(s.disconnected)
    })

    it("should not output anything if the limit is 0", function(done) {
      var s = sig()

      s.limit(0)
       .call(sink, assert.deepEqual, [])
       .done(done)

      s.putEach([1, 2, 3, 4, 5, 6])
       .end()
    })
  })


  describe(".once", function() {
    it("should limit a signal to its first output", function(done) {
      var s = sig()

      s.once()
       .call(sink, assert.deepEqual, [1])
       .done(done)

      s.putEach([1, 2, 3, 4, 5, 6])
       .end()
    })

    it("should end the signal chain after outputting a value", function() {
      var s = sig()
      s.once().then(sig()).done()

      assert(!s.disconnected)
      s.put(23)
      assert(s.disconnected)
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

    it("should handle errors from its source signals", function() {
      var a = sig()
      var b = sig()
      var results = captureErrors(sig.any([a, b]))

      a.throw(new Error(':/'))
      b.throw(new Error(':|'))
      a.throw(new Error('o_O'))
      b.throw(new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })

    it("should support argument objects", function() {
      function test() {
        sig.any(arguments)
          .call(capture, assert.deepEqual, [[1, 0], [2, 1]])
      }

      test(sig.ensureVal(1), sig.ensureVal(2))
    })
  })


  describe(".all", function() {
    it("should support arrays with only non signals", function() {
      var s = sig.all([21, 22, 23])
      assert.deepEqual(capture(s), [[21, 22, 23]])
    })

    it("should support objects with only non signals", function() {
      var s = sig.all({
        a: 21,
        b: 22,
        c: 23
      })

      assert.deepEqual(capture(s), [{
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

    it("should handle errors from its source signals", function() {
      var a = sig()
      var b = sig()
      var results = captureErrors(sig.all([a, b]))

      a.throw(new Error(':/'))
      b.throw(new Error(':|'))
      a.throw(new Error('o_O'))
      b.throw(new Error('-_-'))
      
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

    it("should handle errors from its source signals", function() {
      var a = sig()
      var b = sig()
      var results = captureErrors(sig.merge([a, b]))

      a.throw(new Error(':/'))
      b.throw(new Error(':|'))
      a.throw(new Error('o_O'))
      b.throw(new Error('-_-'))
      
      assert.deepEqual(results, [':/', ':|', 'o_O', '-_-'])
    })

    it("should support argument objects", function() {
      function test() {
        sig.merge(arguments)
          .call(capture, assert.deepEqual, [1, 2])
      }

      test(sig.ensureVal(1), sig.ensureVal(2))
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
      t.putEach([1, 2, 3])

      var u = sig()
      s.put(u)

      u.putEach([4, 5, 6])
      t.putEach([7, 8, 9])
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
  })


  describe(".ensureVal", function() {
    it("should return a sticky signal if a value is given", function() {
      sig.ensureVal(23)
        .call(capture, assert.deepEqual, [23])
    })

    it("should return sticky target signal if a signal is given", function() {
      var s = sig()
      var t = sig.ensureVal(s)
      s.put(23)

      t.call(capture, assert.deepEqual, [23])
      t.call(capture, assert.deepEqual, [23])
    })
  })

  describe(".to", function() {
    it("should redirect signal output", function() {
      var s = sig()
      var t = sig()
      var results = capture(t)

      s.to(t)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should redirect signal errors", function(done) {
      var s = sig()
      var t = sig()
      var e = new Error(':/')

      s.to(t)

      t.catch(function(nextE) {
         assert.strictEqual(e, nextE)
         done()
       })
       .done()

      s.throw(e)
    })

    it("should disconnect when the target has ended", function() {
      var s = sig()
      var t = sig()
      var u = s.to(t)

      assert(!u.disconnected)
      t.end()
      assert(u.disconnected)
    })

    it("should disconnect when the target disconnects", function() {
      var s = sig()
      var t = sig()
      var u = s.to(t)
      var v = t.done()

      assert(!u.disconnected)
      v.end()
      assert(u.disconnected)
    })

    it("should reconnect when the target reconnects", function() {
      var s = sig()
      var t = sig()
      var u = s.to(t)
      t.done().end()

      assert(u.disconnected)
      t.then(sig()).done()
      assert(!u.disconnected)
    })
  })


  describe(".tap(fn)", function() {
    it("should call the given function", function() {
      var s = sig()
      var results = []

      s.tap(function(v) { results.push(v) })
       .done()

      assert(!results.length)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should propagate the source signal's values", function() {
      var s = sig()

      var results = s
        .tap(function() {})
        .call(capture)

      assert(!results.length)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should support extra arguments", function() {
      var s = sig()
      var results = []

      s.tap(function(a, b, c) { results.push([a, b, c]) }, 32, 23)
       .done()

      assert(!results.length)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [
        [1, 32, 23],
        [2, 32, 23],
        [3, 32, 23]])
    })
  })


  describe(".tap(t)", function() {
    it("should redirect to the target signal", function() {
      var s = sig()
      var t = sig()
      var results = capture(t)

      s.tap(t)
       .done()

      assert(!results.length)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should propagate the source signal's values", function() {
      var s = sig()

      var results = s
        .tap(sig())
        .call(capture)

      assert(!results.length)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should stop redirecting when the returned signal ends", function() {
      var s = sig()
      var t = sig()
      var u = s.tap(t)
      var results = capture(t)
      u.done()

      assert(!results.length)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])

      u.end()

      s.put(4)
       .put(5)
       .put(6)

      assert.deepEqual(results, [1, 2, 3])
    })

    it("should continue propagating when the target disconnects", function() {
      var s = sig()
      var t = sig()

      var results = s
        .tap(t)
        .call(capture)

      assert(!results.length)

      s.put(1)
       .put(2)
       .put(3)

      assert.deepEqual(results, [1, 2, 3])

      t.end()

      s.put(4)
       .put(5)
       .put(6)

      assert.deepEqual(results, [1, 2, 3, 4, 5, 6])
    })
  })


  describe(".putTo", function() {
    it("should put the given value onto the given signal", function() {
      var s = sig()
      var results = capture(s)
      sig.putTo(1, s)
      sig.putTo(2, s)
      sig.putTo(3, s)
      assert.deepEqual(results, [1, 2, 3])
    })
  })


  describe(".resolve", function() {
    it("should put the given value, then die", function() {
      var ended = false

      sig()
        .teardown(function() { ended = true })
        .resolve(23)
        .call(capture, assert.deepEqual, [23])

      assert(ended)
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
  })


  describe(".event", function() {
    it("should propagate a value each event emit", function() {
      var s = sig()
      var results = s.event('foo').call(capture)

      sig._emit_(s, 'foo', 21)
      assert.deepEqual(results, [21])

      sig._emit_(s, 'foo', 22)
      assert.deepEqual(results, [21, 22])

      sig._emit_(s, 'foo', 23)
      assert.deepEqual(results, [21, 22, 23])
    })

    it("should stop listening when the event signal ends", function() {
      var s = sig()
      var t = s.event('foo')
      assert.equal(s.eventListeners.foo.length, 1)
      t.end()
      assert(!s.eventListeners.foo.length)
    })
  })


  describe(".functor", function() {
    it("should simply return a function if one is given", function() {
      function foo(){}
      assert.strictEqual(sig.functor(foo), foo)
    })

    it("should wrap non-functions", function() {
      var obj = {}
      assert.strictEqual(sig.functor(obj)(), obj)
    })
  })
})
