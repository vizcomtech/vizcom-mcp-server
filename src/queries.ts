/**
 * SHA256 hashes for Vizcom's persisted GraphQL queries.
 * Production Vizcom blocks ad-hoc queries — all requests must
 * reference a known hash from the server's persisted operations registry.
 */
export const QUERIES = {
  login: 'c37972de8c8fa1e7730c8ada39d449b5e85af84976dabf5c991ca73ade86f49c',
  currentUser: '7642a262cce2bdc4ecbd4aa177cefa763ab5bc14e6cd44a4724d84493addf593',
  organizationTeams: '968cc8447ff861734022856fae80eaa49ed678bf0b7393c947ac62114545b466',
  folder: '09ea3ee697d92ca907ee45793f979909ca1f60af3c65c606f776daa17074f597',
  workbenchesByFolderId: 'c7d4b5c335c3c37f317a01a8f71aa5beffc9a895f2a4896c4011e1c7060d4066',
  workbenchContent: '25b7b82d5f8dd557c3bc452ed8b3c48cdf3fd325992fbe0e04233b7874168318',
  drawingById: '880f13b5d2bfc5ececc74892bcf3c14017a07f10413ef9e3f109a3bd8fc2ceb3',
  CreateEditPrompt: 'c65c7ade69523f777473657a42f11e3fbfb152d401a2d9a9531d6a493f56dafb',
  CreatePrompt: '0cc4dab3daf35f26e7e5b465d1e331571d88080188344b9c2ebcc0ae69d525d8',
  prompt: 'b4cce795880973b37db38b620805a648b062c21b8da181988f19feaeef615c7a',
  CreateWorkbench: 'f8a465f759e3f698fc3e32f6743c135dc4e1a579ea35e12efbebd9b06e4bd1e5',
} as const;
