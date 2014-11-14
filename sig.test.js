require('chai').should()
var sig = require('./sig')
var vv = require('drainpipe')


function capture(s) {
  var values = []

  sig.map(s, function(x) {
    values.push(x)
  })

  return values
}


describe("sig", function() {
  it("should support signal pausing and resuming", function() {
    var results = []
    var s = sig()

    var t = sig()
    t.receiver = function(x, t) { sig.push(t, x) }

    var u = sig()
    u.receiver = function(x) { results.push(x) }

    sig.watch(t, s)
    sig.watch(u, t)

    sig.push(s, 1)
    results.should.be.empty

    sig.resume(s)
    results.should.be.empty

    sig.resume(t)
    results.should.deep.equal([1])

    sig.push(s, 2)
    results.should.deep.equal([1, 2])

    sig.pause(t)
    sig.push(s, 3)
    results.should.deep.equal([1, 2])

    sig.resume(t)
    results.should.deep.equal([1, 2, 3])

    sig.pause(s)
    sig.push(s, 4)

    sig.resume(s)
    results.should.deep.equal([1, 2, 3, 4])
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

    sig.push(s1, 1)
    sig.push(s2, 2)
    sig.push(s1, 3)
    sig.push(s2, 4)

    results.should.deep.equal([1, 2, 3, 4])
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
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)
      (sig.push, 4)

    results1.should.deep.equal([1, 2, 3, 4])
    results2.should.deep.equal([1, 2, 3, 4])
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

    sig.push(s1, 1)
    sig.push(s2, 2)
    sig.push(s1, 3)
    sig.push(s2, 4)

    results.should.be.empty
  })

  it("should allow a source signal to be reset", function() {
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
    sig.reset(s)

    vv(s)
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)
      (sig.push, 4)

    results1.should.be.empty
    results2.should.be.empty
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
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)
      (sig.push, 4)

    results.should.be.empty
  })

  it("should support signal dependencies", function() {
    var s = sig()
    var t = sig()
    var u = sig()
    var results = capture(u)

    sig.depend(t, s)
    sig.depend(u, t)

    vv(u)
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)

    results.should.deep.equal([1, 2, 3])

    sig.reset(s)

    vv(u)
      (sig.push, 4)
      (sig.push, 5)
      (sig.push, 6)

    results.should.deep.equal([1, 2, 3])
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
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)

    results.should.deep.equal([1, 2, 3])
  })

  it("should prevent duplicate sources", function() {
    var s = sig()
    var t = sig()
    sig.watch(t, s)
    sig.watch(t, s)
    t.sources.should.have.length(1)
  })

  it("should prevent duplicate targets", function() {
    var s = sig()
    var t = sig()
    sig.watch(t, s)
    sig.watch(t, s)
    s.targets.should.have.length(1)
  })

  it("should prevent duplicate dependencies", function() {
    var s = sig()
    var t = sig()
    sig.depend(t, s)
    sig.depend(t, s)
    s.dependants.should.have.length(1)
  })

  it("should act as an identity for existing signals", function() {
    var s = sig()
    sig(s).should.equal(s)
  })

  it("should create a signal from an array of values", function() {
    capture(sig([23])).should.deep.equal([23])
    capture(sig([1, 2, 3, 4])).should.deep.equal([1, 2, 3, 4])
  })

  it("should create a signal from a single value", function() {
    capture(sig(23)).should.deep.equal([23])
  })
})


describe("sig.map", function() {
  it("should map the given signal", function() {
    var results = []
    var s = sig()

    vv(s)
      (sig.map, function(x) { return x * 2 })
      (sig.map, function(x) { return x + 1 })
      (sig.map, function(x) { results.push(x) })

    vv(s)
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)
      (sig.push, 4)

    results.should.deep.equal([3, 5, 7, 9])
  })

  it("should allow additional args", function() {
    function fn(a, b, c) {
      return [a, b, c]
    }

    vv([1, 2, 3, 4])
      (sig)
      (sig.map, fn, 23, 32)
      (capture)
      ()
      .should.deep.equal([
        [1, 23, 32],
        [2, 23, 32],
        [3, 23, 32],
        [4, 23, 32]])
  })
})


describe("sig.filter", function() {
  it("should filter the given signal", function() {
    var s = sig()

    var results = vv(s)
      (sig.filter, function(x) { return x % 2 })
      (sig.filter, function(x) { return x < 10 })
      (capture)
      ()

    vv(s)
      (sig.push, 2)
      (sig.push, 3)
      (sig.push, 4)
      (sig.push, 5)
      (sig.push, 6)
      (sig.push, 11)
      (sig.push, 12)
      (sig.push, 15)
      (sig.push, 16)

    results.should.deep.equal([3, 5])
  })

  it("should allow additional args", function() {
    function fn(a, b, c) {
      return (a * b) % c
    }

    vv([1, 2, 3, 4])
      (sig)
      (sig.filter, fn, 3, 2)
      (capture)
      ()
      .should.deep.equal([1, 3])
  })
})


describe("sig.limit", function() {
  it("should limit the given signal", function() {
    var s = sig()

    var results = vv(s)
      (sig.limit, 3)
      (capture)
      ()

    vv(s)
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)
      (sig.push, 4)
      (sig.push, 5)
      (sig.push, 6)

    results.should.deep.equal([1, 2, 3])
  })
})


describe("sig.once", function() {
  it("should limit a signal to its first output", function() {
    var s = sig()

    var results = vv(s)
      (sig.once)
      (capture)
      ()

    vv(s)
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)
      (sig.push, 4)
      (sig.push, 5)
      (sig.push, 6)

    results.should.deep.equal([1])
  })
})


describe("sig.then", function() {
  it("should only map a signal's first output", function() {
    vv([1, 2, 3, 4])
      (sig)
      (sig.then, function(x) {
        return x + 1
      })
      (capture)
      ()
      .should.deep.equal([2])
  })

  it("should allow additional args", function() {
    function fn(a, b, c) {
      return [a, b, c]
    }

    vv([1, 2, 3, 4])
      (sig)
      (sig.then, fn, 23, 32)
      (capture)
      ()
      .should.deep.equal([[1, 23, 32]])
  })
})


describe("sig.isSig", function() {
  it("should determine whether something is a signal", function() {
    sig.isSig(void 0).should.be.false
    sig.isSig(null).should.be.false
    sig.isSig({}).should.be.false
    sig.isSig(sig()).should.be.true
  })
})


describe("sig.spread", function() {
  it("should spread an array out as a function's arguments", function() {
    vv([1, 2, 3])
      (sig.spread(function(a, b, c) {
        return [a + 1, b + 1, c + 1]
      }))
      (sig.spread(function(a, b, c) {
        return [a * 2, b * 2, c * 2]
      }))
      ()
      .should.deep.equal([4, 6, 8])
  })

  it("should append additional args", function() {
    var fn = sig.spread(function(a, b, c, d) {
      return [a, b, c, d]
    })

    fn([1, 2], 3, 4).should.deep.equal([1, 2, 3, 4])
  })
})


describe("sig.any", function() {
  it("should support arrays with both signals and non-signals", function() {
    var a = sig()
    var b = sig()

    var results = vv([a, b, 23])
      (sig.any)
      (capture)
      ()

    results.should.be.empty

    sig.push(a, 1)
    results.should.deep.equal([[1, 0]])

    sig.push(b, 2)
    results.should.deep.equal([[1, 0], [2, 1]])

    sig.push(a, 3)
    results.should.deep.equal([[1, 0], [2, 1], [3, 0]])

    sig.push(b, 4)
    results.should.deep.equal([[1, 0], [2, 1], [3, 0], [4, 1]])
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

    results.should.be.empty

    sig.push(a, 1)
    results.should.deep.equal([[1, 'a']])

    sig.push(b, 2)
    results.should.deep.equal([[1, 'a'], [2, 'b']])

    sig.push(a, 3)
    results.should.deep.equal([[1, 'a'], [2, 'b'], [3, 'a']])

    sig.push(b, 4)
    results.should.deep.equal([[1, 'a'], [2, 'b'], [3, 'a'], [4, 'b']])
  })

  it("should reset all its listeners when the out signal is reset", function() {
    var a = sig()
    var b = sig()
    var s = sig.any([a, b])
    a.targets.should.have.length(1)
    b.targets.should.have.length(1)
    sig.reset(s)
    a.targets.should.have.length(0)
    b.targets.should.have.length(0)
  })
})


describe("sig.all", function() {
  it("should support arrays with only non signals", function() {
    vv([21, 22, 23])
     (sig.all)
     (capture)
     ().should.deep.equal([[21, 22, 23]])
  })

  it("should support objects with only non signals", function() {
    vv({
       a: 21,
       b: 22,
       c: 23
      })
      (sig.all)
      (capture)
      ().should.deep.equal([{
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

    results.should.be.empty

    sig.push(a, 1)
    results.should.be.empty

    sig.push(b, 2)
    results.should.deep.equal([[1, 2, 23]])

    sig.push(a, 3)
    results.should.deep.equal([[1, 2, 23], [3, 2, 23]])

    sig.push(b, 4)
    results.should.deep.equal([[1, 2, 23], [3, 2, 23], [3, 4, 23]])
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

    results.should.be.empty

    sig.push(a, 1)

    results.should.be.empty

    sig.push(b, 2)

    results.should.deep.equal([{
      a: 1,
      b: 2,
      c: 23
    }])

    sig.push(a, 3)

    results.should.deep.equal([{
      a: 1,
      b: 2,
      c: 23
    }, {
      a: 3,
      b: 2,
      c: 23
    }])

    sig.push(b, 4)

    results.should.deep.equal([{
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

    sig.push(a, 1)
    sig.push(a, 2)
    sig.push(a, 3)

    results.should.have.length(3)
    results[0].should.not.equal(results[1])
    results[1].should.not.equal(results[2])
    results[2].should.not.equal(results[0])
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

    sig.push(a, 1)
    sig.push(a, 2)
    sig.push(a, 3)

    results.should.have.length(3)
    results[0].should.not.equal(results[1])
    results[1].should.not.equal(results[2])
    results[2].should.not.equal(results[0])
  })

  it("should reset all its listeners when the out signal is reset", function() {
    var a = sig()
    var b = sig()
    var s = sig.all([a, b])
    a.targets.should.have.length(1)
    b.targets.should.have.length(1)
    sig.reset(s)
    a.targets.should.have.length(0)
    b.targets.should.have.length(0)
  })

  it("should work with signals with non-empty buffers", function() {
    var a = sig()
    sig.push(a, 1)

    var b = sig()
    sig.push(b, 2)

    vv([a, b])
      (sig.all)
      (capture)
      ()
      .should.deep.equal([[1, 2]])
  })
})
