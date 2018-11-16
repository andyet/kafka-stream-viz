import * as d3 from 'd3'
import _ from 'lodash'
import SizedArray from '../../consumer/sizedArray'

export default class StreamChart {
  constructor(options) {
    this.container = document.querySelector(options.selector)

    this.xVariable = options.x
    this.yVariable = options.y
    this.transition = options.transition
    this.maxSize = options.maxSize
    this.maxDisplaySize = options.maxDisplaySize

    const svg = d3
      .select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')

    const chartArea = svg.append('g').attr('transform', 'translate(0, 0)')

    this.clipPath = chartArea
      .append('defs')
      .append('clipPath')
      .attr('id', 'clip')
      .append('rect')

    this.chartArea = chartArea.append('g').attr('clip-path', 'url(#clip)')
    this.xAxisG = chartArea.append('g').attr('class', 'x-axis')

    // The first points need to be rendered outside the x axis
    const rightEdge = 3
    this.xScale = d3
      .scaleLinear()
      .domain([this.maxDisplaySize + rightEdge, rightEdge])
    this.yScale = d3.scaleLinear()

    this.xAxis = d3
      .axisBottom()
      .tickValues(_.range(rightEdge, this.maxDisplaySize + rightEdge + 1, 15))
      .tickFormat((d) => {
        const seconds = d - rightEdge
        return `${seconds}s`
      })
      .scale(this.xScale)

    this.stack = d3.stack().offset(d3.stackOffsetSilhouette)

    this.area = d3
      .area()
      .x((d, index, items) => {
        const last = index === items.length - 1
        // Force the first data point to always line up with the right edge
        const secondsAgo = last
          ? 0
          : Math.floor((new Date() - d.data[this.xVariable]) / 1000)
        return this.xScale(secondsAgo)
      })
      .y0((d) => this.yScale(d[0]))
      .y1((d) => this.yScale(d[1]))
      .curve(d3.curveBasis)
  }

  getHeight() {
    return this.container.clientHeight
  }

  getWidth() {
    return this.container.clientWidth
  }

  formatData(raw) {
    const keys = Object.keys(raw)
    const minValues = Math.min(..._.values(raw).map((arr) => arr.length))

    // x values must be the same for all data points in a stack
    // This sets the time to the lowest second for that index
    const times = _.range(minValues).map((__, index) => {
      const value = Math.min(
        ...keys.map((key) => _.at(raw, `${key}.${index}.${this.xVariable}`))
      )
      const date = new Date(value)
      date.setMilliseconds(0)
      return date
    })

    return times.map((time, index) => {
      const values = keys.map((key) =>
        _.at(raw, `${key}.${index}.${this.yVariable}`)
      )
      return Object.assign(
        { [this.xVariable]: time },
        _.zipObject(keys, values)
      )
    })
  }

  init(data) {
    this._lastData = new SizedArray(this.maxSize)
    this._lastData.push(this.formatData(data))

    this.updateScaleAndAxesData({ first: true })
    this.updateScales({ first: true })
    this.updateAxes({ first: true })
    this.updateStacks({ first: true })
    d3.select(this.container).classed('loading', false)

    window.addEventListener('resize', () => this.resize())
    this._initialized = true
  }

  resize() {
    this.updateScaleAndAxesData()
    this.updateScales()
    this.updateAxes()
    this.updateStacks()
  }

  update(data) {
    if (!this._initialized) return

    this._lastData.push(this.formatData(data))

    this.updateScaleAndAxesData({ transition: this.transition })
    this.updateScales({ transition: this.transition })
    this.updateAxes({ transition: this.transition })
    this.updateStacks({ transition: this.transition })
  }

  updateScaleAndAxesData() {
    // Using silhouette offset keeps the center at 0 so this sets the y scale
    // so 0 is always in the middle
    const max =
      d3.max(this._lastData.items(), (d) =>
        _.reduce(_.omit(d, this.xVariable), _.add)
      ) / 2
    this.yScale.domain([-1 * max, max]).nice()
  }

  updateScales() {
    this.xScale.range([0, this.getWidth()])
    this.yScale.range([this.getHeight(), 0])
  }

  updateAxes() {
    this.clipPath
      .attr('width', this.getWidth())
      .attr('height', this.getHeight())

    this.xAxisG
      .attr('transform', `translate(0, ${this.getHeight() + 15})`)
      .call(this.xAxis)

    this.xAxisG
      .selectAll('text')
      .nodes()
      .map((node, index, nodes) => {
        if (index === 0) {
          node.setAttribute('style', 'text-anchor: end')
        } else if (index === nodes.length - 1) {
          node.setAttribute('style', 'text-anchor: start')
        }
      })
  }

  updateStacks(options = {}) {
    const data = this._lastData.items()
    const first = data[0]
    const topics = Object.keys(_.omit(first, this.xVariable))
    this.stack.keys(topics)

    const updateSelection = this.chartArea
      .selectAll('.chart-path')
      .data(this.stack(data))

    const enterSelection = updateSelection
      .enter()
      .append('path')
      .attr('class', (__, index) => `chart-path chart-color-${index + 1}`)

    updateSelection.exit().remove()

    enterSelection
      .merge(updateSelection)
      .transition()
      .duration(options.transition || 0)
      .ease(d3.easeLinear)
      .on('start', (d, index, nodes) => {
        const node = nodes[index]

        d3.select(node)
          .attr('d', this.area)
          .attr('transform', null)

        d3.active(node).attr(
          'transform',
          `translate(${this.xScale(this.xScale.domain()[0] + 1)},0)`
        )
      })
  }
}
