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
})
