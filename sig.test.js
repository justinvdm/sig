require('chai').should()
var sig = require('./sig')
var v = require('drainpipe')


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
    var t = sig(function(x, t) { sig.push(t, x) })
    var u = sig(function(x) { results.push(x) })

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
    var t = sig(function(x) { results.push(x) })

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
    var t1 = sig(function(x) { results1.push(x) })
    var t2 = sig(function(x) { results2.push(x) })

    sig.resume(s)
    sig.resume(t1)
    sig.resume(t2)

    sig.watch(t1, s)
    sig.watch(t2, s)

    v(s)
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
    var t = sig(function(x) { results.push(x) })

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
    var t1 = sig(function(x) { results1.push(x) })
    var t2 = sig(function(x) { results2.push(x) })

    sig.resume(s)
    sig.resume(t1)
    sig.resume(t2)

    sig.watch(t1, s)
    sig.watch(t2, s)
    sig.reset(s)

    v(s)
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
    var t = sig(function(x) { results.push(x) })

    sig.resume(s)
    sig.resume(t)

    sig.watch(t, s)
    sig.unwatch(t, s)

    v(s)
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

    v(u)
     (sig.push, 1)
     (sig.push, 2)
     (sig.push, 3)

    results.should.deep.equal([1, 2, 3])

    sig.reset(s)

    v(u)
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

    v(u)
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

  it("should allow initial values to be given up front", function() {
    capture(sig([23])).should.deep.equal([23])
    capture(sig([1, 2, 3, 4])).should.deep.equal([1, 2, 3, 4])
  })

  it("should act as an identity for existing signals", function() {
    var s = sig()
    sig(s).should.equal(s)
  })
})


describe("sig.map", function() {
  it("should map the given signal", function() {
    var results = []
    var s = sig()

    v(s)
     (sig.map, function(x) { return x * 2 })
     (sig.map, function(x) { return x + 1 })
     (sig.map, function(x) { results.push(x) })

    v(s)
     (sig.push, 1)
     (sig.push, 2)
     (sig.push, 3)
     (sig.push, 4)

    results.should.deep.equal([3, 5, 7, 9])
  })

  it("should provide the relevant stream to map functions", function(done) {
    var s = sig()
    var t = sig.map(s, function(x, u) {
      u.should.equal(t)
      done()
    })
    sig.push(s, 1)
  })
})


describe("sig.filter", function() {
  it("should filter the given signal", function() {
    var s = sig()

    var results = v(s)
      (sig.filter, function(x) { return x % 2 })
      (sig.filter, function(x) { return x < 10 })
      (capture)
      ()

    v(s)
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

  it("should provide the relevant stream to filter functions", function(done) {
    var s = sig()
    var t = sig.filter(s, function(x, u) {
      u.should.equal(t)
      done()
    })
    sig.push(s, 1)
  })
})


describe("sig.limit", function() {
  it("should limit the given signal", function() {
    var results = []
    var s = sig()

    var results = v(s)
      (sig.limit, 3)
      (capture)
      ()

    v(s)
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
    var results = []
    var s = sig()

    var results = v(s)
      (sig.once)
      (capture)
      ()

    v(s)
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
    var results = []
    var s = sig()

    v(s)
      (sig.then, function(x) { results.push(x) })

    v(s)
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)
      (sig.push, 4)
      (sig.push, 5)
      (sig.push, 6)

    results.should.deep.equal([1])
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
    v([1, 2, 3])
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
