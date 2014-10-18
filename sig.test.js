require('chai').should()
var sig = require('./sig')
var dp = require('drainpipe')


describe("sig", function() {
  it("should allow multiple source signals", function() {
    var results = []
    var s1 = sig()
    var s2 = sig()
    var t = sig(function(x) { results.push(x) })

    sig.watch(s1, t)
    sig.watch(s2, t)

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

    dp(s)
      (sig.watch, t1)
      (sig.watch, t2)

    dp(s)
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

    sig.watch(s1, t)
    sig.watch(s2, t)
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

    sig.watch(s, t1)
    sig.watch(s, t2)
    sig.reset(s)

    dp(s)
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

    sig.watch(s, t)
    sig.unwatch(s, t)

    dp(s)
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)
      (sig.push, 4)

    results.should.be.empty
  })

  it("should allow signals to map other signals", function() {
    var results = []
    var s = sig()

    dp(s)
      (sig.map, function(x) { return x * 2 })
      (sig.map, function(x) { return x + 1 })
      (sig.map, function(x) { results.push(x) })

    dp(s)
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)
      (sig.push, 4)

    results.should.deep.equal([3, 5, 7, 9])
  })

  it("should allow signals to filter other signals", function() {
    var results = []
    var s = sig()

    dp(s)
      (sig.filter, function(x) { return x % 2 })
      (sig.filter, function(x) { return x < 10 })
      (sig.map, function(x) { results.push(x) })

    dp(s)
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

  it("should provide the relevant stream to map functions", function(done) {
    var s = sig()
    var t = sig.map(s, function(x, u) {
      u.should.equal(t)
      done()
    })
    sig.push(s, 1)
  })

  it("should provide the relevant stream to filter functions", function(done) {
    var s = sig()
    var t = sig.filter(s, function(x, u) {
      u.should.equal(t)
      done()
    })
    sig.push(s, 1)
  })

  it("should support signal limiters", function() {
    var results = []
    var s = sig()

    dp(s)
      (sig.limit, 3)
      (sig.map, function(x) { results.push(x) })

    dp(s)
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)
      (sig.push, 4)
      (sig.push, 5)
      (sig.push, 6)

    results.should.deep.equal([1, 2, 3])
  })

  it("should provide a 'once' limiter", function() {
    var results = []
    var s = sig()

    dp(s)
      (sig.once, 3)
      (sig.map, function(x) { results.push(x) })

    dp(s)
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)
      (sig.push, 4)
      (sig.push, 5)
      (sig.push, 6)

    results.should.deep.equal([1])
  })

  it("should prove a utility for checking if something is a signal", function() {
    sig.isSig(void 0).should.be.false
    sig.isSig(null).should.be.false
    sig.isSig({}).should.be.false
    sig.isSig(sig()).should.be.true
  })

  it("should provide a spread utility", function() {
    dp([1, 2, 3])
      (sig.spread(function(a, b, c) {
        return [a + 1, b + 1, c + 1]
      }))
      (sig.spread(function(a, b, c) {
        return [a * 2, b * 2, c * 2]
      }))
      ().should.deep.equal([4, 6, 8])
  })

  it("s spread utility should append additional args", function() {
    var fn = sig.spread(function(a, b, c, d) {
      return [a, b, c, d]
    })

    fn([1, 2], 3, 4).should.deep.equal([1, 2, 3, 4])
  })

  it("should support signal dependencies", function() {
    var results = []
    var s = sig()
    var t = sig()
    var u = sig()
    sig.map(u, function(x) { results.push(x) })

    sig.depend(s, t)
    sig.depend(t, u)

    dp(u)
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)

    results.should.deep.equal([1, 2, 3])

    sig.reset(s)

    dp(u)
      (sig.push, 4)
      (sig.push, 5)
      (sig.push, 6)

    results.should.deep.equal([1, 2, 3])
  })

  it("should allow signals to stop depending on other signals", function() {
    var results = []
    var s = sig()
    var t = sig()
    var u = sig()
    sig.map(u, function(x) { results.push(x) })

    sig.depend(s, t)
    sig.depend(t, u)
    sig.undepend(t, u)
    sig.reset(s)

    dp(u)
      (sig.push, 1)
      (sig.push, 2)
      (sig.push, 3)

    results.should.deep.equal([1, 2, 3])
  })
})
