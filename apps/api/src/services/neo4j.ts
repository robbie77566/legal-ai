import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.NEO4J_URI || 'bolt://localhost:7688';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'password';

export const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

export const getSession = () => driver.session();

export const closeDriver = async () => {
  await driver.close();
};
