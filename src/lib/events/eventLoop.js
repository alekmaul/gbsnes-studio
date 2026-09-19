const id = "EVENT_LOOP";
const groups = ["EVENT_GROUP_CONTROL_FLOW"];

const fields = [
  {
    key: "true",
    type: "events"
  }
];

const compile = (input, helpers) => {
  const {
    labelDefine,
    labelGoto,
    nextFrameAwait,
    compileEvents,
    event
  } = helpers;
  const loopId = `loop_start_${event.id}`;
  labelDefine(loopId);
  compileEvents(input.true);
  nextFrameAwait();
  labelGoto(loopId);
};

module.exports = {
  id,
  groups,
  fields,
  compile
};
