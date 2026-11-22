// One builder's crash never blanks the island: the broken part renders nothing and is logged.
import { Component } from 'react';

export class Safe extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err) {
    const c = (window.__cozy = window.__cozy || {});
    (c.errors = c.errors || []).push(`${this.props.name}: ${err && err.message}`);
    console.error('[cozy] ' + this.props.name, err);
  }
  render() {
    return this.state.err ? null : this.props.children;
  }
}
