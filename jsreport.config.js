module.exports = {
  'name': 'oracle-store',
  'main': './lib/main.js',
  'optionsSchema': {
    store: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['oracle'] }
      }
    },
    extensions: {
      'oracle-store': {
        type: 'object',
        properties: {
          schemaCreation: { type: 'boolean', default: true },
          schema: { type: 'string' },
          uri: { type: 'string' },
          user: { type: 'string' },
          password: { type: 'string' },
          connectString: { type: 'string' },
          options: { type: 'object' }
        }
      }
    }
  }
}
