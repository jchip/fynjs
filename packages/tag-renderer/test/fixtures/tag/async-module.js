export default async function setup(_options, token) {
  await Promise.resolve();
  return {
    process() {
      return `async ${token.props.value}`;
    },
  };
}
