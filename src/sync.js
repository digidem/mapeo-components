import React from 'react'
import randombytes from 'randombytes'
import through from 'through2'
import path from 'path'
import xhr from 'xhr'
import querystring from 'querystring'
import split2 from 'split2'
import pump from 'pump'
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

function Target (target) {
  target.type = target.name ? 'wifi' : 'file'
  return target
}

export default class SyncComponent extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      targets: {}
    }
    this.streams = {}
  }

  replicate (target) {
    var self = this
    if (!target) return
    var server = this.props.server
    var stream = start(server, target)
    var id = randombytes(16).toString('hex')
    this.streams[id] = stream
    stream.on('data', function (data) {
      try {
        var row = JSON.parse(data)
      } catch (err) {
        console.error(err)
        return
      }
      var t = Target(target)
      t.status = row.topic
      t.message = self.props.messages[row.topic] || row.message
      self.state.targets[target.name] = t
      if (status !== 'replication-progress') self.setState({statuses: self.state.statuses})
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
      targets.forEach(function (t) {
        var old = self.state.targets[t.name] || {}
        self.state.targets[t.name] = Object.assign(old, t)

      })
      self.setState({targets: self.state.targets})
    })
  }

  render () {
    var self = this
    var {message, targets} = this.state
    const {filename, onClose} = this.props
    if (filename) {
      var name = path.basename(filename)
      this.replicate({filename, name})
    }

    return (
      <div>
        {Object.keys(targets).length === 0
          ? <div className='subtitle'>Searching for devices&hellip;</div>
          : <div className='subtitle'>Available Devices</div>
        }
        <ul>
          {Object.keys(targets).map(function (key) {
            var t = targets[key]
            if (t.name === 'localhost') return
            return (
              <li className='row' key={t.name}>
                <div className='target'>
                  <span className='name'>{t.name}</span>
                  <span className='info'>via {t.type}</span>
                </div>
                {t.status ? <h3>{t.message}</h3> :
                  <button className='sync-button' onClick={self.replicate.bind(self, t)}>
                    arrow
                  </button>
                }
              </li>
            )
          })}
        </ul>
      </div>
    )
  }
}
