import React from 'react'
import randombytes from 'randombytes'
import through from 'through2'
import path from 'path'
import xhr from 'xhr'
import querystring from 'querystring'
import split2 from 'split2'
import pump from 'pump'
import {remote} from 'electron'
import hyperquest from 'hyperquest'

function announce (server, cb) {
  var opts = {
    method: 'GET',
    url: `${server}/sync/announce`
  }
  xhr(opts, function (err, res, body) {
    if (err) return cb(err)
    return cb(null, body)
  })
}

function getTargets (server, cb) {
  var opts = {
    method: 'GET',
    url: `${server}/sync/targets`
  }
  xhr(opts, function (err, res, body) {
    if (err) return cb(err)
    return cb(null, body)
  })
}

function start (server, target) {
  var url = `${server}/sync/start?${querystring.stringify(target)}`
  var hq = hyperquest(url)
  return pump(hq, split2())
}

export default class SyncComponent extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      targets: [],
      wifis: {},
      files: {}
    }
    this.streams = {}
  }

  replicate (target) {
    var self = this
    if (!target) return
    var stream = start(this.props.server, target)
    var id = randombytes(16).toString('hex')
    this.streams[id] = stream
    stream.on('data', function (data) {
      try {
        var row = JSON.parse(data)
      } catch (err) {
        console.error(err)
        return
      }
      var status = row.topic
      var message = messages[status] || row.message
      // TODO: this is clunky, improve status rendering via external module?
      var msg = { status, message, target }
      if (target.name) self.state.wifis[target.name] = msg
      if (target.filename) self.state.files[target.filename] = msg
      if (status !== 'replication-progress') self.setState({wifis: self.state.wifis, files: self.state.files})
    })

    stream.on('error', function (err) {
      if (err) console.error(err)
    })

    stream.on('end', function () {
      delete self.streams[id]
    })
  }

  componentWillUnmount () {
    var self = this
    Object.keys(this.streams).map((k) => self.streams[k].destroy())
    this.streams = {}
    clearInterval(this.interval)
  }

  componentDidMount () {
    this.interval = setInterval(this.updateTargets.bind(this), 1000)
    announce(this.props.server, function (err) {
      if (err) console.error(err)
    })
  }

  updateTargets () {
    var self = this
    getTargets(this.props.server, function (err, targets) {
      if (err) return console.error(err)
      targets = JSON.parse(targets)
      self.setState({targets})
    })
  }

  render () {
    var self = this
    var {message, status, targets, wifis, files} = this.state

    return (
        <ul>
          {targets.map(function (t) {
            if (t.name === 'localhost') return
            return (
              <div className='target' key={t.name}>
                <div className='target'>
                  <span className='name'>{t.name}</span>
                  <span className='info'>via WiFi</span>
                </div>
                {wifis[t.name] ? <h3>{wifis[t.name].message}</h3> :
                  <div className='sync-button' onClick={self.replicate.bind(self, t)}>
                    arrow
                  </div >
                }
              </div>
            )
          })}
          {Object.keys(files).map(function (k) {
            var t = files[k]
            return (
              <div key={t.target.filename}>
                <div className='target'>
                  <span className='name'>{path.basename(t.target.filename)}</span>
                  <span className='info'>via File</span>
                </div>
                <h3>{t.message}</h3>
              </div >
            )
          })}
        </ul>
    )
  }
}
