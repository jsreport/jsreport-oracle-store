const oracledb = require('oracledb')
const Store = require('jsreport-sql-store')

module.exports = async (reporter, definition) => {
  if (reporter.options.store.provider !== 'oracle') {
    definition.options.enabled = false
    return
  }

  let pool

  async function executeQuery (q, opts = {}) {
    async function execute (conn) {
      const bindVars = []

      for (let i = 0; i < q.values.length; i++) {
        bindVars.push(q.values[i])
      }

      let res = await conn.execute(q.text, bindVars, { outFormat: oracledb.OUT_FORMAT_OBJECT })

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

    let res = await execute(conn)

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

  pool = await oracledb.createPool(definition.options)

  // avoid exposing connection string through /api/extensions
  definition.options = {}
}
