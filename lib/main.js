const oracledb = require('oracledb')
const Store = require('jsreport-sql-store')

module.exports = async (reporter, definition) => {
  if (reporter.options.store.provider !== 'oracle') {
    definition.options.enabled = false
    return
  }

  function transformBindVarsBoolean (bindVars) {
    for (let index = 0; index < bindVars.length; index++) {
      const bindVar = bindVars[index]

      if (bindVar === true) {
        bindVars[index] = 1
      } else if (bindVar === false) {
        bindVars[index] = 0
      }
    }
  }

  function transformResultBoolean (opts, res) {
    function tranformResultBooleanForType (type) {
      if (type) {
        for (let index = 0; index < res.rows.length; index++) {
          const row = res.rows[index]

          for (const property in row) {
            const propDef = type[property]

            if (propDef && propDef.type === 'Edm.Boolean') {
              if (row[property] === 1) {
                row[property] = true
              } else if (row[property] === 0) {
                row[property] = false
              }
            }
          }
        }
      }
    }

    if (res.rows && opts.entitySet) {
      const entitySet = reporter.documentStore.model.entitySets[opts.entitySet]

      if (entitySet) {
        const entityType = entitySet.entityType.substring(9) // remove "jsreport." prefix
        tranformResultBooleanForType(reporter.documentStore.model.complexTypes[entityType])
        tranformResultBooleanForType(reporter.documentStore.model.entityTypes[entityType])
      }
    }
  }

  async function executeQuery (q, opts = {}) {
    async function execute (conn) {
      const bindVars = []

      for (let i = 0; i < q.values.length; i++) {
        bindVars.push(q.values[i])
      }

      transformBindVarsBoolean(bindVars)

      const res = await conn.execute(q.text, bindVars, { outFormat: oracledb.OUT_FORMAT_OBJECT })

      transformResultBoolean(opts, res)

      return {
        records: res.rows,
        rowsAffected: res.rowsAffected
      }
    }

    let conn

    if (!opts.transaction) {
      conn = await pool.getConnection()
    } else {
      conn = opts.transaction
    }

    const res = await execute(conn)

    if (!opts.transaction) {
      await conn.commit()
      await conn.close()
    }

    return res
  }

  const transactionManager = {
    async start () {
      return pool.getConnection()
    },
    async commit (conn) {
      await conn.commit()
      await conn.close()
    },
    async rollback (conn) {
      await conn.rollback()
      await conn.close()
    }
  }

  // use clob instead of the limited varchar2(4000) by setting maxLength = max
  reporter.documentStore.on('before-init', () => {
    function processType (typeName, typeDef) {
      for (const propName in typeDef) {
        const propDef = typeDef[propName]
        if (propDef.type === 'Edm.String' && propDef.document) {
          propDef.maxLength = 'max'
        } else if (propDef.type === 'Edm.String' && typeName === 'SettingType' && propName === 'value') {
          propDef.maxLength = 'max'
        }
      }
    }

    for (const typeName in reporter.documentStore.model.complexTypes) {
      processType(typeName, reporter.documentStore.model.complexTypes[typeName])
    }

    for (const typeName in reporter.documentStore.model.entityTypes) {
      processType(typeName, reporter.documentStore.model.entityTypes[typeName])
    }
  })

  const store = Object.assign(
    Store(definition.options, 'oracle', executeQuery, transactionManager),
    {
      close: () => {
        if (pool) {
          return pool.close()
        }
      }
    }
  )

  reporter.documentStore.registerProvider(store)

  oracledb.fetchAsString = [oracledb.CLOB]
  oracledb.fetchAsBuffer = [oracledb.BLOB]
  const pool = await oracledb.createPool(definition.options)

  // avoid exposing connection string through /api/extensions
  definition.options = {}
}
